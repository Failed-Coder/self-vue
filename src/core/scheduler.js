// ### 调度优化
import reactive, { effect } from './observer.js';

const obj = {
    count: 0
};

const observer = reactive(obj);

/**
 * * 下面结果是 0 1 end
 * ? 但是我们希望在不改变代码前提下, 结果是 0 end 1
 * todo 我们需要一个调度器来解决这个问题
 * * 我们希望 effect 提供一个 可选项，来控制调度行
 */
// // effect(() => console.log(observer.count));
// effect(() => console.log(observer.count), {
//     scheduler: (fn) => {
//         setTimeout(fn, 0);
//     }
// });
// observer.count++;
// console.log('end');

// 定义一个任务队列
const jobQueue = new Set();
// 使用 Promise.resolve() 创建一个 promise 实例，我们用它将一个任务添加到微任务队列
const p = Promise.resolve();
// 一个标志代表是否正在刷新队列
let isFlushing = false;
const flushJobs = () => {
    // 如果队列正在刷新，则什么都不做
    if (isFlushing) return;
    // 如果没在刷新，则将标志设为 true
    isFlushing = true;
    // 在微任务队列中刷新 jobQueue 队列
    p.then(() => {
        jobQueue.forEach(job => job());
    }).finally(() => {
        isFlushing = false;
        jobQueue.clear();
    });
}

effect(() => console.log(observer.count), {
    scheduler: (fn) => {
        jobQueue.add(fn);
        flushJobs();
    }
});

observer.count++;
observer.count++;
observer.count++;