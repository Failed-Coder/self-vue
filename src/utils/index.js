/**
 * @description 判断一个对象的属性是否不是 null 或 undefined
 */
export const hasOwn = (obj, key) => {
    return Object.hasOwn(obj, key);
}


/**
 * @description 属性是否不为 null 或 undefined
 */
export const notEmpty = (something) => {
    return something !== null && something !== void 0;
}