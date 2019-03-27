const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
const babel = require('rollup-plugin-babel');

const config = (src, dst) => ({
    input: src,
    output: {
        file: dst,
        format: 'iife',
        sourcemap: true,
    },
    plugins: [
        resolve(),
        commonjs(),
        babel({ exclude: 'node_modules/**' }),
    ],
});

const bundle = name => config(
    `src/${name}.js`,
    `public/bundles/${name}.bundle.js`
);

module.exports = [ 'rich-apps' ].map(bundle);
