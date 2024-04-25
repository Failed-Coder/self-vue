class CustomConsolePlugin {
    constructor(options) {
        // 可以在这里接收一些自定义的配置选项
        this.options = options;
    }

    apply(compiler) {
        compiler.hooks.done.tap('CustomConsolePlugin', (stats) => {
            const { compilation } = stats;
            const { errors, warnings } = compilation;
            // 处理错误信息
            if (errors && errors.length) {
                console.error('Webpack 构建出现错误！', errors);
            }
            // 处理警告信息
            if (warnings && warnings.length) {
                console.warn('Webpack 构建出现警告！', warnings);
            }
        });
    }
}

module.exports = CustomConsolePlugin;