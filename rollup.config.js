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
    moduleContext: name => {
        if (name.match(/@ungap\/(essential-weakset|weakmap|custom-event|essential-map)/)) {
            return 'window';
        } else {
            return 'undefined';
        }
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
    //'plane',
    //'plane-gl',
    //'trail.worker',
    //'trail-worker-3d',
    //'turblines2d',
    'cimon-app',
    'cimon-lipsync',
    'airplane',
    'trails-worker',
    'rotation-lock-app',
    'scenes-app',
].map(bundle);
