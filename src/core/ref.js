import reactive, { effect, track, trigger, shallowReactive, readonly } from "./observer.js";

export const __isRef = Symbol.for('__isRef');

// const count = ref(0);
// effect(() => {
//     console.log(count.value);
// });
// setTimeout(() => {
//     count.value++;
// }, 1000);

// const obj = reactive({
//     foo: 1,
//     bar: 2
// })

// ### toRef
// const newObject = {
//     foo: toRef(obj, 'foo'),
//     bar: toRef(obj, 'bar'),
//     // 一个一个转化，不推荐，所以我封装 toRefs
// }

// ### toRefs
// const newObject = {
//     ...toRefs(obj)
// }

// effect(() => {
//     console.log(newObject.foo.value);

//     console.log(newObject.bar);
// })

// setTimeout(() => {
//     newObject.foo.value = 10;
// }, 1000)

// setTimeout(() => {
//     newObject.bar.value = 30;
// }, 2000)

// ### 模板内脱 ref
// const newObject = proxyRefs(toRefs(obj));

// effect(() => {
//     console.log(newObject.foo);

//     console.log(newObject.bar);
// })


export function isRef(obj) {
    // 先判断是否是对象
    const flag = obj && typeof obj === 'object';
    if (!flag) {
        return false;
    }
    // 判断是否是 ref 创建的对象
    return obj.__isRef === true;
}

export default function ref(value) {
    // 在 ref 函数内部创建包裹对象
    const wrapper = {
        value
    }
    Object.defineProperty(wrapper, __isRef, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false
    })
    // 将包裹对象变成响应式数据
    return reactive(wrapper);
}

// 单个转化
export function toRef(obj, key) {
    const wrapper = {
        get value() {
            return obj[key];
        },
        set value(newValue) {
            obj[key] = newValue;
        }
    }
    Object.defineProperty(wrapper, __isRef, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false
    })
    return wrapper;
}

// 将对象转化为 ref 对象
export function toRefs(obj) {
    const result = Array.isArray(obj) ? new Array(obj.length) : {};
    for (let key in obj) {
        result[key] = toRef(obj, key);
    }
    return result;
}

// 由于我们一直要使用 ref.value 才能获取值，我们实现一个 自动脱 ref 的函数
// 仅在模板中使用，不推荐在逻辑中使用
export function proxyRefs(target) {
    return new Proxy(target, {
        get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver)
            return isRef(value) ? value.value : value;
        },
        set(target, key, newValue, receiver) {
            const oldValue = Reflect.get(target, key, receiver);
            if (isRef(oldValue) && !isRef(newValue)) {
                oldValue.value = newValue;
            } else {
                Reflect.set(target, key, newValue, receiver);
            }
            return true;
        }
    })
}