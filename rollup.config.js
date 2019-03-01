const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
const notify = require('rollup-plugin-notify');
const {terser} = require('rollup-plugin-terser');

const production = !process.env.ROLLUP_WATCH;

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
        production && terser(),
        notify(),
    ],
});

const bundle = name => config(
    `src/${name}.js`,
    `public/bundles/${name}.bundle.js`
);

module.exports = [
    'plane',
    'plane-gl',
    'trail.worker',
    'airplane',
].map(bundle);
