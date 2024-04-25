import { effect, track, trigger } from './observer.js';

// ### lazy + computed
/**
 * * computed 是一个特殊的 effect
 * * 它接受一个 getter 函数
 * * 我们把 getter 作为副作用函数，创建一个 lazy 的 effect
 * * 当读取 value 时才执行 effectFn
 */
const computed = (getter) => {
    // value 用来缓存上一次计算的值
    let value;

    // dirty 标志，用来标识是否需要重新计算值，为 true 则意味着“脏”，需要计算
    let dirty = true;

    // 把 getter 作为副作用函数，创建一个 lazy 的 effect
    const effectFn = effect(getter, {
        lazy: true,
        // 当 count 改变时，重新计算值
        scheduler: () => {
            if (!dirty) {
                dirty = true;
                trigger(computedRunner, 'value');
            }
        }
    })

    const computedRunner = {
        // 当读取 value 时才执行 effectFn
        get value() {
            if (dirty) {
                value = effectFn();
                dirty = false;
            }
            track(computedRunner, 'value');
            return value;
        }
    };

    return computedRunner;
}

export default computed;