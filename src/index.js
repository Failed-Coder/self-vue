import './index.less';

import { computed, effect, ref } from '@vue/reactivity';
import createRenderer, { Text, Comment, Fragment } from '@/compiler/index.js';

import { selfSetAttribute } from '@/utils/dom.js';
import { resolveClass, resolveStyle } from '@/utils/style.js';


// 创建一个渲染器函数，基于浏览器环境
const { render } = createRenderer({
    insert: (el, parent, anchor = null) => {
        parent.insertBefore(el, anchor);
    },
    createElement: (type) => document.createElement(type),
    createTextNode: (text) => document.createTextNode(text),
    createComment: (text) => document.createComment(text),
    setElementText: (el, text) => {
        el.textContent = text;
    },
    patchProps: (el, key, prevValue, nextValue) => {
        selfSetAttribute(el, key, prevValue, nextValue)
    },
});
const root = document.getElementById('root');

const count = ref(0);

const MyComponent = () => ({
    type: 'div',
    props: {
        style: resolveStyle('margin-left: 20px;font-size: 16px;cursor: pointer;'),
    },
    children: 'click me - function component'
})

const list = ref([
    { id: 1, name: 'foo' },
    { id: 2, name: 'bar' },
    { id: 3, name: 'baz' },
    { id: 4, name: 'qux' },
]);

const someVnode = computed(() => {
    return {
        type: 'ul',

        children: list.value.map(item => ({
            type: 'li',
            props: {
                style: resolveStyle('margin-top: 10px;'),
            },
            children: item.name,
        })),
    }
})

effect(() => {
    const vnode = {
        type: 'div',
        props: {
            style: resolveStyle('font-size: 16px;cursor: pointer;'),
            class: resolveClass({
                'container': true,
                'container-active': count.value > 0,
            }),
        },
        children: [
            {
                type: 'div',
                props: {
                    style: resolveStyle('color: red;margin: 12px 0 12px 12px;height: 24px;'),
                    class: resolveClass({
                        'child': true,
                        'child-active': count.value > 0,
                    }),
                },
                children: count.value,
            },
            {
                type: 'button',
                props: {
                    style: resolveStyle('margin-left: 10px;'),
                    onClick: () => {
                        count.value++;
                    },
                },
                children: 'add',
            },
            {
                type: 'button',
                props: {
                    style: resolveStyle({
                        marginLeft: '12px',
                    }),
                    onClick: () => {
                        count.value--;
                    },
                },
                children: 'minus',
            },
            {
                type: Comment,
                children: '注释',
            },
            {
                type: Fragment,
                children: [
                    {
                        type: Text,
                        children: '文本节点1',
                    },
                    {
                        type: Text,
                        children: '文本节点2',
                    },
                ],
            },
            {
                type: MyComponent,
            },
            someVnode.value,
            {
                type: 'button',
                props: {
                    onClick: () => {
                        list.value = list.value.reverse();
                    },
                },
                children: 'reverse list',
            }
        ],
    }

    render(vnode, root);
})



