import { isRef, __isRef } from "./ref.js";
// 使用简单的 Set, 会导致，每次修改都会触发所有的 effect
// const bucket = new Set();
// 所以我们重新设计 bucket
const bucket = new WeakMap();

let activeEffect = null;

// 是否可以被追踪 或 收集依赖
let shouldTrack = true;

// 为了解决 effect 嵌套的问题，我们需要一个栈来存储 activeEffect
const effectStack = [];

// 针对 for in 循环 或 Set.size 或 Map 的 forEach 收集依赖的特殊 key, 最正确的是 调用 reactive 赋值一个新的 Symbol, 不是一个固定的值
const ITERATE_KEY = Symbol();

// 一个可以获取代理对象的原始对象的 Symbol key
const RAW = Symbol.for('RAW');

// 一个用来收集 Map.keys 方法的特殊 key
const MAP_KEY_ITERATE_KEY = Symbol.for('MAP_KEY_ITERATE_KEY');

// 定义一个 Map 实例，存储原始对象到代理对象的映射
const reactiveMap = new Map();

// 重写 Array.prototype.includes 方法
const arrayInstrumentations = {};
const originMethod = Array.prototype.includes;
arrayInstrumentations.includes = function (...args) {
    // 当前 includes 的 this 指向的是代理对象
    let res = originMethod.apply(this, args);

    // 如果 res 为 false，说明代理对象中不包含目标值
    if (res === false) {
        // 我们需要拿到原始值，然后再进行判断
        res = originMethod.apply(this[RAW], args);
    }
    return res;
}
// 于此类似的还有 indexOf, lastIndexOf, findIndex, find
const arrayMethods = ['indexOf', 'lastIndexOf', 'findIndex', 'find'];
arrayMethods.forEach(method => {
    const originMethod = Array.prototype[method];
    arrayInstrumentations[method] = function (...args) {
        let res = originMethod.apply(this, args);

        if (res === -1 || res === undefined) {
            res = originMethod.apply(this.raw, args);
        }

        return res;
    }
});

// 为了避免 push 操作导致的无限递归导致的栈溢出, 需重写 push 之类的方法
const arrayMutatorMethods = ['push', 'pop', 'shift', 'unshift', 'splice'];
arrayMutatorMethods.forEach(method => {
    const originMethod = Array.prototype[method];
    arrayInstrumentations[method] = function (...args) {
        // 关闭依赖收集
        shouldTrack = false;
        const res = originMethod.apply(this, args);
        // 在调用原始方法之后，恢复原来的行为，即允许追踪
        shouldTrack = true;
        return res;
    }
});

// 重写 Set 一些方法实现响应式
const SetMutableInstrumentations = {
    add(key) {
        // this 仍然指向的是代理对象，通过 raw 属性获取原始数据对象
        const target = this[RAW];
        // 先判断值是否已经存在
        const hadKey = target.has(key)
        // 通过原始数据对象执行 add 方法添加具体的值
        // 注意，这里不再需要 .bind 了，因为是直接通过 target 调用并执行的
        const res = target.add(key);
        // 触发依赖
        !hadKey && trigger(target, key, 'ADD');
        return res;
    },
    delete(key) {
        const target = this[RAW];
        const hadKey = target.has(key);
        const res = target.delete(key);
        // 触发依赖
        hadKey && trigger(target, key, 'DELETE');
        return res;
    },
}

// 重写 Map 一些方法实现响应式
const MapMutableInstrumentations = {
    get(key) {
        const target = this[RAW];
        const had = target.has(key);
        track(target, key);
        if (had) {
            const res = target.get(key);
            // 需要注意的是，返回的res仍可能是一个可代理对象
            return typeof res === 'object' ? reactive(res) : res;
        }
    },
    set(key, value) {
        const target = this[RAW];
        const had = target.has(key);
        const oldValue = target.get(key);
        // 避免污染原始数据对象, value 也可能是一个代理对象, 这意味着 我们可能对原始值上 set 了一个响应式对象
        //! 我们把响应式数据设置到原始数据上的行为称为数据污染
        // 获取原始数据，由于 value 本身可能已经是原始数据，所以此时 value.raw 不存在，则直接使用 value
        const rawValue = value[RAW] || value;
        const res = target.set(key, rawValue);
        if (!had) {
            trigger(target, key, 'ADD');
        } else if (value !== oldValue || (value === value && oldValue === oldValue)) {
            trigger(target, key, 'SET');
        }
        return res;
    },
    /**
     * 遍历操作只与键值对的数量有关，因此任何会修改 Map 对象键值
     * 对数量的操作都应该触发副作用函数重新执行，例如 delete 和 add
     * 方法等。所以当 forEach 函数被调用时，我们应该让副作用函数与 ITERATE_KEY 建立响应联系
     */
    forEach(callback, thisArg) {
        // wrap 函数用来把可代理的值转换为响应式数据
        const wrap = (value) => typeof value === 'object' ? reactive(value) : value;

        const target = this[RAW];
        // 通过 track 函数建立与 ITERATE_KEY 的响应联系
        track(target, ITERATE_KEY);
        target.forEach((v, k) => {
            // 通过 wrap 函数将值转换为响应式数据
            callback.call(thisArg, wrap(v), wrap(k), this);
        });
    },
    // 重写 [Symbol.iterator] 方法，并且 entries 与其等价
    [Symbol.iterator]: iterationMethod,
    entries: iterationMethod,
    values() {
        const target = this[RAW];
        const iterator = target.values();
        const wrap = (val) => typeof val === 'object' && val !== null ? reactive(val) : val;
        track(target, ITERATE_KEY);
        return {
            next() {
                const { value, done } = iterator.next();
                // value 是值，而非键值对，所以只需要包裹 value 即可
                return {
                    value: wrap(value),
                    done
                }
            },
            return() {
                return iterator.return();
            },
            throw(e) {
                return iterator.throw(e);
            },
            [Symbol.iterator]() {
                return this;
            }
        }
    },
    keys() {
        const target = this[RAW];
        const iterator = target.keys();
        const wrap = (val) => typeof val === 'object' && val !== null ? reactive(val) : val;
        track(target, MAP_KEY_ITERATE_KEY);
        return {
            next() {
                const { value, done } = iterator.next();
                return {
                    value: wrap(value),
                    done
                }
            },
            return() {
                return iterator.return();
            },
            throw(e) {
                return iterator.throw(e);
            },
            [Symbol.iterator]() {
                return this;
            }
        }
    }
};

// 重写 Map.prototype.entries、 [Symbol.iterator] 方法 抽离为独立的函数，便于复用
function iterationMethod() {
    const target = this[RAW];
    const iterator = target[Symbol.iterator]();
    const wrap = (val) => typeof val === 'object' && val !== null ? reactive(val) : val;
    track(target, ITERATE_KEY);
    return {
        next() {
            const { value, done } = iterator.next();
            return {
                value: value ? [wrap(value[0]), wrap(value[1])] : value,
                done
            }
        },
        return() {
            return iterator.return();
        },
        throw(e) {
            return iterator.throw(e);
        },
        /**
         * TypeError: p.entries is not a function or its return value is not iterable
         * 切勿把可迭代协议与迭代器协议搞混。可迭代协议指的是一个对象实现了 Symbol.iterator 方法, 迭代器协议指的是一个对象实现了 next 方法。
         * 但一个对象可以同时实现可迭代协议和迭代器协议
         */
        [Symbol.iterator]() {
            return this;
        }
    }
}

/**
 * * 我们希望 effect 可以接受一个函数作为参数
 * ! 我们希望可以接受一个可选项，来控制调度行为， 或其他行为
 */
const effect = (fn, options = {}) => {
    const effectFn = () => {
        // 实现相同依赖清除工作
        cleanUp(effectFn);
        activeEffect = effectFn;
        // activeEffect 无法满足 effect 嵌套的情况
        effectStack.push(effectFn);

        // fn();
        // 将 fn 的执行结果存储到 res 中
        const res = fn() // 新增

        // 从栈中移除当前的 effect
        effectStack.pop();

        activeEffect = effectStack[effectStack.length - 1];

        return res;
    }
    effectFn.options = options;
    // 用来存储所有与该副作用函数相关的依赖集合
    effectFn.deps = [];

    // 只有非 lazy 的时候，才执行
    if (!options.lazy) {
        effectFn();
    }

    // 将副作用函数作为返回值返回
    return effectFn;
}

/**
 * * 我们希望当我们读取了某个属性时，可以收集到与该属性相关的副作用函数 -> 收集依赖
 */
const track = (target, key) => {
    if (!activeEffect || !shouldTrack) {
        return;
    }
    let depsMap = bucket.get(target);
    if (!depsMap) {
        depsMap = new Map();
        bucket.set(target, depsMap);
    }
    let deps = depsMap.get(key);
    if (!deps) {
        deps = new Set();
        depsMap.set(key, deps);
    }
    deps.add(activeEffect);

    activeEffect.deps.push(deps);
};

/**
 * * 我们希望当我们修改了某个属性时，可以触发所有与该属性相关的副作用函数 -> 派发更新
 * ! 有了 options 后，我们需要根据 options 来决定是否调度
 */

const trigger = (target, key, type, newValue) => {
    const depsMap = bucket.get(target);
    if (!depsMap) return;
    const effects = depsMap.get(key);
    // 清除 effects 同时又添加，会导致死循环
    // effects && effects.forEach(effect => effect());

    const effectsRunAll = new Set();
    effects && effects.forEach(effect => {
        // 守卫条件，避免自增之类的，即读取有赋值导致的死循环
        if (effect !== activeEffect) {
            effectsRunAll.add(effect)
        }
    });

    if (
        ['DELETE', 'ADD'].includes(operateTypes[type])
        /**
         * 如果操作类型是 SET，并且目标对象是 Map 类型的数据, 我们也应派发更新使用了 forEach 的副作用函数
         * 例如：new Map(['key1, 'value1'], ['key2', 'value2]).forEach((value, key) => { console.log(value, key)})
         * 但是我们可能 set('key2', 'value4'), 按道理我们应该对 forEach 的副作用函数进行派发更新
         */
        || (
            operateTypes[type] === 'SET'
            && Object.prototype.toString.call(target) === '[object Map]'
        )
    ) {
        const iterateEffects = depsMap.get(ITERATE_KEY);
        iterateEffects && iterateEffects.forEach(effect => {
            if (effect !== activeEffect) {
                effectsRunAll.add(effect);
            }
        });
    }

    // 针对 Map keys 的特殊处理, 添加删除 key 时，需要触发所有与 key 相关的副作用函数, 修改key是，无需触发 keys 相关的副作用函数
    if (
        ['DELETE', 'ADD'].includes(operateTypes[type])
        && Object.prototype.toString.call(target) === '[object Map]'
    ) {
        const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY);
        iterateEffects && iterateEffects.forEach(effect => {
            if (effect !== activeEffect) {
                effectsRunAll.add(effect);
            }
        });
    }

    // ! 针对 代理数组的 length 属性的处理
    if (operateTypes[type] === 'ADD' && Array.isArray(target)) {
        // 取出与 length 相关联的副作用函数
        const lengthEffects = depsMap.get('length')

        lengthEffects && lengthEffects.forEach(effect => {
            if (effect !== activeEffect) {
                // 尽管添加, 无需担心与 effect 重复, 因为 Set 会自动去重
                effectsRunAll.add(effect);
            }
        });
    }

    // ! 如果操作目标是数组，并且修改了数组的 length 属性
    if (Array.isArray(target) && key === 'length') {
        // 对于索引大于或等于新的 length 值的元素
        // 需要把所有相关联的副作用函数取出并添加到 effectsToRun 中待执行
        depsMap.forEach((effects, key) => {
            if (key >= newValue) {
                effects.forEach(effect => {
                    effect !== activeEffect && effectsRunAll.add(effect)
                })
            }
        });
    }

    // 调度
    effectsRunAll.forEach(effect => {
        if (effect.options.scheduler) {
            effect.options.scheduler(effect);
        } else {
            effect();
        }
    });
};
/**
 * * trigger 的操作类型
 */
const operateTypes = {
    ADD: 'ADD',
    SET: 'SET',
    DELETE: 'DELETE'
}

const cleanUp = (effect) => {
    effect.deps.forEach(dep => {
        dep.delete(effect);
    });
    effect.deps.length = 0;
};


// ### 死循环优化
/**
 * ! 下面这样代码，会导致死循环
 * * observer.count++ => observer.count = observer.count + 1 
 * ? 为什么会导致死循环呢？
 * * 即我们即读取了 count 的值，又设置了 count 的值
 * * 我们读取了 count 的值, 触发了 track, 然后我们 +1 又赋值给 count, 触发了 trigger, 但此时 activeEffect 仍未执行完毕, 就要重新执行了
 * * 但是我们的 track 和 trigger 是执行的同一个 activeEffect
 */

/**
 * @description reactive Vue3 响应式原理
 * * 读取操作是个宽泛的概念 如 obj.count, 'count' in obj, for (const key in obj)
 * * 我们从引擎内部来"读取"的操作
 * 
 * ? 数组代理
 * * 在 JavaScript 中，有两种对象，普通对象、异质对象
 * * 数组是一种特殊的对象，它的 key 是数字，value 是任意类型
 * * 大部分操作对象的拦截，对数组也生效，仅需特殊处理几种情况，并改写部分数组原型方法
 * 
 * ? Set 代理
 * ? Map 代理
 * * 都是通过重写部分原型方法来实现的
 */
export default function createReactive(obj, isShallow = false, isReadonly = false) {
    return new Proxy(obj, {
        get(target, key, receiver) {
            // 我们在 get 拦截器赋予一个功能 -> 当代理对象读取 raw 属性时，返回原始对象
            if (key === RAW) return target;

            // 针对 Set 的代理
            if (key === 'size') {
                track(target, ITERATE_KEY)
                return Reflect.get(target, key, target);
            }

            // 针对的 Set 代理
            if (
                Object.prototype.toString.call(target) === '[object Set]'
            ) {
                // 如果是 Set 的 add, clear, delete, has 方法，则返回 SetMutableInstrumentations[key]
                if (SetMutableInstrumentations.hasOwnProperty(key)) {
                    return Reflect.get(SetMutableInstrumentations, key, receiver);
                }
                return target[key].bind(target);
            }

            // 针对 Map 的代理
            if (
                Object.prototype.toString.call(target) === '[object Map]'
            ) {
                if (MapMutableInstrumentations.hasOwnProperty(key)) {
                    return Reflect.get(MapMutableInstrumentations, key, receiver);
                }
                return target[key].bind(target);
            }

            // 针对 代理数组.includes(原始值) 为 false 的问题
            // 如果操作的目标对象是数组，并且 key 存在于 arrayInstrumentations 中，则返回 arrayInstrumentations[key]
            if (
                Array.isArray(target)
                && arrayInstrumentations.hasOwnProperty(key)
            ) {
                return Reflect.get(arrayInstrumentations, key, receiver)
            }

            // 只有在非只读的情况下，才会进行依赖收集
            // 由于 for of 收集依赖会调用 valueOf 方法，他们都会读取到 Symbol.iterator 是一个 symbol, 为了避免错误, 以及性能上的考虑, 我们不收集 Symbol
            !isReadonly && typeof key !== 'symbol' && typeof key !== __isRef && track(target, key);

            const res = Reflect.get(target, key, receiver);
            // 如果是对象，我们需要递归代理
            if (
                typeof res === 'object'
                && res !== null
                && !isShallow
            ) {
                // 如果数据为只读，则调用 readonly 对值进行包装, 不然我们深层只读对象 例如 obj.a.b.c = 1 仍可修改
                return isReadonly ? readonly(res) : reactive(res);
            }
            return isRef(res) ? res.value : res;
        },
        set(target, key, newValue, receiver) {
            if (isReadonly) {
                console.warn(`self Vue: attribute ${key} is readonly`)
                return true
            }
            const oldValue = target[key];
            // ! 由于我们在添加属性或是修改属性都会触发 set 操作, 所以我们要区分出来
            // ! 如果代理目标是数组，则检测被设置的索引值是否小于数组长度 -> 代理数组功能补充
            const type = Array.isArray(target) ? Number(key) < target.length ? 'SET' : 'ADD'
                : Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD';

            const res = Reflect.set(target, key, newValue, receiver);
            // oldValue !== newValue 如此简单的 全等比对 是不严谨有缺陷的 例如 NaN !== NaN 是 true
            // target === receiver.raw 说明 receiver 就是 target 的代理对象  -> 用来解决原型链的问题
            if (
                target === receiver[RAW]
                && oldValue !== newValue
                && (oldValue === oldValue || newValue === newValue)
            ) {
                trigger(target, key, type, newValue);
            }
            return res;
        },

        // 'key' in obj 触发依赖收集
        has(target, key) {
            !isReadonly && track(target, key);
            return Reflect.has(target, key);
        },

        // 拦截 ownKeys 操作即可间接拦截 for...in 循环
        /**
         * 我们在使用 track 函数进行追踪的时候，
         * 将 ITERATE_KEY 作为追踪的 key，为什么这么做呢？这是因
         * 为 ownKeys 拦截函数与 get/set 拦截函数不同，在 set/get 中，我
         * 们可以得到具体操作的 key，但是在 ownKeys 中，我们只能拿到目标
         * 对象 target，而无法得知具体的 key，所以我们需要一个特殊的 key。
         * 并且这也符合直觉，我们循环时，并没有读取具体的 key。
         * 
         * 收集到了依赖，如何触发呢?
         * 如何触发 ITERATE_KEY 的依赖呢？
         */
        ownKeys(target) {
            // 如果操作目标 target 是数组，则使用 length 属性作为 key 并建立响应联系
            !isReadonly && track(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
            return Reflect.ownKeys(target);
        },

        // deleteProperty 操作
        deleteProperty(target, key) {
            if (isReadonly) {
                console.warn(`属性 ${key} 是只读的`)
                return true
            }
            // 检查是否存在该属性 -> 处理原型链响应式收集
            const hadKey = Object.prototype.hasOwnProperty.call(target, key);
            const res = Reflect.deleteProperty(target, key);
            // 只有在成功删除自身属性时，才触发 trigger
            res && hadKey && trigger(target, key, 'DELETE');
            return res;
        }
    });
}

export function reactive(obj) {
    // 我们需要一个缓存，避免重复代理
    // const tempObj = {}
    // const arr = reactive([tempObj]);
    // console.log(arr.includes(arr[0])); // true 实现预期效果了
    const existProxy = reactiveMap.get(obj);
    if (existProxy) return existProxy;

    const proxy = createReactive(obj);
    reactiveMap.set(obj, proxy);

    return proxy;
}

export function shallowReactive(obj) {
    const existProxy = reactiveMap.get(obj);
    if (existProxy) return existProxy;

    const proxy = createReactive(obj, true);
    reactiveMap.set(obj, proxy);
    return proxy;
}

export function readonly(obj) {
    const existProxy = reactiveMap.get(obj);
    if (existProxy) return existProxy;

    const proxy = createReactive(obj, false, true);
    reactiveMap.set(obj, proxy);
    return proxy;
}

export function shallowReadonly(obj) {
    const existProxy = reactiveMap.get(obj);
    if (existProxy) return existProxy;

    const proxy = createReactive(obj, true, true);
    reactiveMap.set(obj, proxy);
    return proxy;
}

export {
    effect,
    track,
    trigger
}