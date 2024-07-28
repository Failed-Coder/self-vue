import { effect } from './observer.js'
/**
 * * 所谓 watch，其本质就是观测一个响应式数据，当数据发生变化时，通知相应的回调函数
 */


// watch(obj, () => {
//     console.log('age changed')
// })

// obj.age = 19 // age changed

// // 上面 watch 等价于

// effect(() => {
//     console.log(obj.foo)
// }, {
//     scheduler: () => {
//         console.log('age changed')
//     }
// })

// 下面是 对 count 属性的硬编码
// const watch = (source, cb) => {
//     effect(
//         () => source.count,
//         {
//             scheduler: () => {
//                 cb()
//             }
//         }
//     )
// }

/**
 * ! 目前缺少 immediate 执行时机
 */
const watch = (source, cb, options = {
    immediate: false,
    deep: false,
    flush: 'post'
}) => {
    // 如果 source 是函数，说明用户传递的是 getter，所以直接把 source 赋值给
    let getter;
    if (typeof source === 'function') {
        getter = source;
    } else {
        getter = () => traverse(source);
    }

    // cleanup 用来存储用户注册的过期回调
    let cleanup;
    const onInvalidate = (fn) => {
        cleanup = fn;
    }

    // 定义旧值与新值
    let newVal, oldVal;
    // 使用 effect 注册副作用函数时，开启 lazy 选项，并把返回值存储到 effectFn 中以便后续手动调用
    // 抽离 scheduler 函数 为独立的函数
    const job = () => {
        newVal = effectFn();
        // 在调用回调函数 cb 之前，先调用过期回调
        cleanup && cleanup();
        cb(oldVal, newVal, onInvalidate);
        oldVal = newVal;
    }

    const effectFn = effect(
        () => getter(), {
        lazy: true,
        // 当数据变化时，执行 scheduler
        scheduler: () => {
            if (options.flush === 'post') {
                // 如果 flush 为 post，把 job 添加到微任务队列中
                Promise.resolve().then(job);
            } else {
                job();
            }
        }
    });
    // 如果 immediate 为 true，立即执行一次回调函数
    if (options.immediate) {
        job();
    } else {
        oldVal = effectFn(); // effectFn() 会执行 getter() 得到旧值，并收集依赖
    }
}

const traverse = (value, seen = new Set()) => {
    // 如果要读取的数据是原始值，或者已经被读取过了，那么什么都不做
    if (typeof value !== 'object' || value === null || seen.has(value)) return;

    // 将数据添加到 seen 中，代表遍历地读取过了，避免循环引用引起的死循环
    seen.add(value);

    // 假设 value 就是一个对象，使用 for...in 读取对象的每一个值，并递归地调用 traverse 进行处理
    for (const k in value) {
        traverse(value[k], seen);
    }

    return value;
}

export default watch