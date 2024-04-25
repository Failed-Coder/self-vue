import reactive, { effect, track, trigger, shallowReactive, readonly } from "../core/observer.js";

const obj = {
    name: 'John Doe',
    ok: true,
    text: 'Hello World',
    foo: true,
    bar: false,
    count: 0,
}
// const observer = reactive(obj);

// effect(
//     () => {
//         console.log('effect run name');
//         document.body.innerText = observer.name;
//     }
// );

// setTimeout(() => {
//     effect(
//         () => {
//             console.log('effect run noExist');
//             document.body.innerText = observer.noExist;
//         }
//     );
//     observer.noExist = "I'm not exist!"
// }, 2000);


// setTimeout(() => {
//     observer.noExist = 'be a exist attribute!'
// }, 3000);

/*=================================================> */

// ### 实现 effect 关联依赖项
// 当我们把 ok 该为 false 是, 我们希望对 text 副作用函数会断开
// effect(() => {
//     console.log('effect run ok');
//     document.body.innerText = observer.ok ? observer.text : 'not'
// })

// setTimeout(() => {
//     observer.ok = false;
// }, 2000);

/*=================================================> */

// ### 实现嵌套的副作用函数
/**
 * 我们期望当 foo 改变时，effect 1 和 effect 2 都会重新执行
 * ? 但是我们修改 foo 时，发现只有 effect 2 重新执行了
 * ! 问题出在我们的 activeEffect 是全局变量, 当我们的副作用函数嵌套时，会导致 activeEffect 被覆盖，所以我们需要一个栈来存储 activeEffect
 * ? 我们如何设计这个栈呢？ -> effectStack
 */
// let temp1, temp2;

// effect(() => {
//     console.log('effect 1 run');

//     effect(() => {
//         console.log('effect 2 run');
//         temp2 = observer.bar;
//     })

//     temp1 = observer.foo;
// });

/*=================================================> */

//! ### computed
// import computed from './core/computed.js';


// const double = computed(() => observer.count * 2);

// console.log(double.value);
// observer.count++;
// console.log(double.value);

// effect(() => console.log('double count', double.value));

// setTimeout(() => {
//     observer.count++;
// }, 2000);

// 上面我们多次读取 double.value, 每次访问都会重新计算, 我们希望只有在 count 改变时才重新计算

/*=================================================> */

// !### watch
// import watch from "./core/watch.js";

// watch(() => observer.count, () => {
//     console.log('count changed');
// }, { immediate: false });

// ### 过期的副作用函数, 我们频繁改动 count 时，有可能第一次的副作用函数还没执行完，就被第二次的副作用函数覆盖了，第二次的请求先完成，第一次的请求后完成，导致得到错误的结果
// let data;
// watch(observer, async (ov, nv, onInvalidate) => {
//     let expired = false;
//     onInvalidate(() => {
//         expired = true;
//     });
//     const res = await new Promise(resolve => setTimeout(() => resolve(nv), 1000));
//     if (!expired) {
//         data = res
//     }
// })

// observer.count++;

// setTimeout(() => {
//     observer.count++;
// }, 200);

// setTimeout(() => {
//     console.log(data);
// }, 5000);

/*=================================================> */

// !### 完善响应式代理 针对 obj.count, 'count' in obj, for (const key in obj)

// effect(() => {
//     for (const key in observer) {
//         console.log(key, observer[key]);
//     }
// })

// setTimeout(() => {
//     observer.count = 1;
// }, 2000);

// setTimeout(() => {
//     observer.some = 'some';
// }, 4000);

// setTimeout(() => {
//     delete observer.text;
// }, 6000);

/*=================================================> */

// ### 处理原型链响应式的问题
// const obj1 = {}

// const proto = { count: 1 }

// const child = reactive(obj1);

// const parent = reactive(proto)

// Object.setPrototypeOf(child, parent);

// effect(() => {
//     console.log(child.count);
// })

// setTimeout(() => {
//     child.count++;
// }, 1000);

/*=================================================> */

// ### 处理深层响应式
// const person = reactive({
//     name: '张三',
//     family: {
//         father: {
//             name: '张父'
//         },
//         mother: {
//             name: '张母'
//         }
//     }
// })

// effect(() => {
//     console.log(person.family.father.name);
// })

// setTimeout(() => {
//     person.family.father.name = '张父改';
// }, 1000)

/*=================================================> */

// ### 浅层响应式
// const person = shallowReactive({
//     name: '张三',
//     family: {
//         father: {
//             name: '张父'
//         },
//         mother: {
//             name: '张母'
//         }
//     }
// });

// effect(() => {
//     console.log(person.family.father.name);
// })

// setTimeout(() => {
//     person.family.father.name = '张父改';
// }, 1000)

// setTimeout(() => {
//     person.family = {
//         father: {
//             name: '张父改浅层'
//         }
//     }
// }, 2000);

/*=================================================> */

// ### readonly
// const person = readonly({
//     name: '张三',
//     family: {
//         father: {
//             name: '张父'
//         },
//         mother: {
//             name: '张母'
//         }
//     }
// });

// effect(() => {
//     console.log(person.family.father.name);
// })

// setTimeout(() => {
//     person.family.father.name = '张父改';
// })

/*=================================================> */

// ### 代理数组
/**
 * ? 数组代理
 * * 在 JavaScript 中，有两种对象，普通对象、异质对象
 * * 所以下面的代码，是可以带正常使用的
 * * 在我们通过索引读取数组时，会触发依赖收集
 * * 但我们对数组的操作与对普通对象的操作仍存在不同
 * 1. 通过索引访问数组的值: persons[0]
 * 2. 访问数组的 length 属性: persons.length
 * 3. 把数组当作对象，使用 for ... in 遍历数组
 * 4. 使用for ... of 遍历数组
 * 5. 数组的原型方法，concat/join/every/some 等等不改变原数组的原型方法
 * 
 * ? 修改数组
 * 1. 根据索引修改: persons[0] = 'rose'
 * 2. 修改数组的 length 属性: persons.length = 0
 * 3. 数组的栈方法: push/pop/shift/unshift/splice 
 * 4. 修改原数组的方法: reverse/sort/fill/copyWithin
 */
// const persons = reactive(['jack'])

// effect(() => {
//     console.log(persons[0]);
// })

// setTimeout(() => {
//     // 能够正常触发响应式
//     persons[0] = 'rose';
// })

// effect(() => {
//     console.log(persons.length);
// })

// setTimeout(() => {
//     // 不能触发响应式
//     // ! 经过 reactive 功能增强后
//     persons[1] = 'Alex';
//     persons.push('Alex');
// }, 1000)

// setTimeout(() => {
//     persons.length = 0;
// }, 2000)

// * 既然数组也是异质对象，我们可以通过 for ... in 遍历数组
// effect(() => {
//     for (const key in persons) {
//         console.log(key, persons[key]);
//     }
// })

// setTimeout(() => {
//     persons.push('Alex');
// }, 1000)

/*=================================================> */

// * 通过 for ... of 遍历数组
// 迭代器是在一个对象实现了 [Symbol.iterator] 方法时，它就是一个可迭代对象
// const test = {
//     [Symbol.iterator]: () => {
//         let i = 0;
//         return {
//             next() {
//                 return {
//                     value: i++,
//                     done: i > 10
//                 }
//             }
//         }
//     }
// }

// for (const item of test) {
//     console.log(item);
// }
// * 所以数组就是一个 实现了 [Symbol.iterator] 方法的对象
// const itr = persons[Symbol.iterator]();
// console.log(itr.next());
// console.log(itr.next());
// console.log(itr.next());

// const arr = [1, 2, 3];

// arr[Symbol.iterator] = function () {
//     const target = this;
//     const len = target.length;
//     let i = 0;
//     return {
//         next() {
//             return {
//                 value: i < len ? target[i] : undefined,
//                 done: i++ >= len
//             }
//         }
//     }

// }
// 我们覆盖了原生的数组迭代器，我们发现，只需要收集 数组的 length 和 索引 的依赖即可
// effect(() => {
//     for (const item of persons) {
//         console.log(item);
//     }
// })

// setTimeout(() => {
//     persons.push('Alex');
// }, 1000)

// * 数组的查找方法
// effect(() => {
//     console.log(persons.includes('rose'));
// })

// setTimeout(() => {
//     persons.push('rose');
// }, 1000)
// 上面无需修改 observe.js 代码，就能正常触发响应式
// 是因为 includes 为了找到 rose, 会内部遍历数组，所以会触发依赖收集

// ! 然而 includes 也不总是按照预期工作
// const tempObj = {}

// const arr = reactive([tempObj]);

// console.log(arr.includes(arr[0]));

// 调整 observe.js 前 是 false,
// * 因为我们代理后代理 arr 后, arr[0] 也变成了一个新的代理对象, 肯定与 原始对象 tempObj 不相等
// * 所以我们要重写 includes 方法
// console.log(arr.includes(tempObj));

// * indexOf
// effect(() => {
//     console.log(persons.indexOf('rose'));
// })

// setTimeout(() => {
//     persons.push('rose');
// }, 1000)


// * 数组的栈方法 -> 隐式修改数组长度
// effect(() => {
//     persons.push('rose');
// })

// effect(() => {
//     persons.push('origin');
// })

// 上面代码在 observe.js 中会导致栈溢出
// 根据ECMA规范中, push 方法 会读取 length 属性, 然后修改 length 属性, 然后修改索引值
// 所以就会导致上面两个独立的副作用函数相互影响 都同时 读取 length 属性, 然后修改 length 属性, 然后修改索引值

/*=================================================> */

// ### 代理 Set 和 Map
// ### Set
// const set = new Set([1, 2, 3]);

// const setProxy = new Proxy(set, {
//     get(target, key, receiver) {
//         if (key === 'size') {
//             // 如果读取的是 size, 我们就把 this 指向 target
//             return Reflect.get(target, key, target);
//         }
//         // 将方法与原始数据对象 target 绑定后返回
//         return target[key].bind(target);
//     }
// })

// console.log(setProxy.size); // 如果不修改 this 的指向, 这里会报错

// setProxy.delete(1);

// console.log(set.constructor);

// const set = reactive(new Set([1, 2, 3]));

// effect(() => {
//     console.log(set.size);
// })

// setTimeout(() => {
//     set.add(4);
// }, 1000);

// setTimeout(() => {
//     set.delete(1);
// }, 1000);

// ### Map
// const m = new Map();

// const p1 = reactive(m);

// const p2 = reactive(new Map());

// p1.set('p2', p2);

// effect(() => {
//     // 注意，这里我们通过原始数据 m 访问 p2
//     console.log(m.get('p2').size);
// });

// // 注意，这里我们通过原始数据 m 为 p2 设置一个键值对 foo --> 1
// setTimeout(() => {
//     m.get('p2').set('foo', 1)
// }, 1000);

// const m = reactive(new Map([
//     [{ key: 1 }, { value: 1 }],
// ]))

// effect(() => {
//     m.forEach((value, key, m) => {
//         console.log(value, key, m);
//     })
// })

// setTimeout(() => {
//     m.set({ key: 2 }, { value: 2 });
// }, 1000);

// 但是下面的代码不会按预期工作
// const key = { key: Symbol() };

// const value = new Set([1, 2, 3]);

// const m = reactive(new Map([
//     [key, value]
// ]));

// effect(() => {
//     m.forEach((value, key, m) => {
//         console.log(value.size);
//     });
// });

// setTimeout(() => {
//     // 修改 observer.js 的 forEach 方法前, 这里不会触发响应式, 但这是不不合直觉的, reactive 是深层响应式的
//     m.get(key).add(4);
// }, 1000);

/**
 * 对于 SET 类型的操作来说，因为它不会改变一个对象的键的数
 * 量，所以当 SET 类型的操作发生时，不需要触发副作用函数重新执行。
 * * 但这个规则不适用于 Map 类型的 forEach 遍历, 如下面的代码
 */

// const m = reactive(new Map([
//     ['key1', 1]
// ]));

// effect(() => {
//     m.forEach((value, key, m) => {
//         // forEach 循环不仅关心集合的键，还关心集合的值
//         console.log(value, key);
//     });
// });

// setTimeout(() => {
//     m.set('key1', 2);
// }, 1000);

// ### 迭代器
// const m = new Map([
//     ['key1', 1],
//     ['key2', 2],
//     ['key3', 3],
// ]);

// console.log(m[Symbol.iterator] === m.entries);

// const mProxy = reactive(m);

// effect(() => {
//     const frag = document.createDocumentFragment();
//     for (const [key, value] of mProxy.entries()) {
//         const div = document.createElement('div');
//         div.innerText = `${key}: ${value}`;
//         frag.appendChild(div);
//     }
//     document.body.appendChild(frag);
// });

// setTimeout(() => {
//     mProxy.set('key4', 4);
// }, 1000);

// effect(() => {
//     for (const key of mProxy.keys()) {
//         console.log(key);
//     }
// })

// setTimeout(() => {
//     // 我们没有改动 key 的值，所以不应该触发副作用函数
//     mProxy.set('key2', 4);
// }, 1000);


// setTimeout(() => {
//     // 我们改动 key 的值，应该触发副作用函数
//     mProxy.set('key4', 2);
// }, 2000);

