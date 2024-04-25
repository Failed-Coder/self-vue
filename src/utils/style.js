/**
 * @description 针对三种 class 的处理方式
 * 1. class="a b c" 
 * 2. :class={ a: true, c: condition } 
 * 3. :class="['a', 'b', { c: true }]"
 * @param {String | Array | Object} class
 */
export const resolveClass = (classValue) => {
    if (typeof classValue === 'string') {
        return classValue;
    } else if (Array.isArray(classValue)) {
        // 处理数组内的对象形式
        const classList = classValue.map((item) => {
            if (typeof item === 'string') {
                return item;
            } else if (typeof item === 'object') {
                return Object.keys(item).filter((key) => item[key]).join(' ');
            }
            return '';
        });
        return classList.join(' ');
    } else if (typeof classValue === 'object') {
        return Object.keys(classValue).filter((key) => classValue[key]).join(' ');
    }
    return '';
}


/**
 * @description 针对 style 的处理方式
 * @param {String | Object} style
 */
export const resolveStyle = (styleValue) => {
    if (typeof styleValue === 'string') {
        return styleValue;
    } else if (typeof styleValue === 'object') {
        return Object.keys(styleValue).map((key) => {
            // 大写字母转为 - 小写字母
            const k = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            return `${k}:${styleValue[key]}`;
        }).join(';');
    }
    return '';
}