import {Ziggurat} from './ziggurat';

export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);

export const HTML = (chunks, ...args) => {
    let html = '';
    chunks.forEach((chunk, i) => {
        html += chunk + (args[i] || '');
    });
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
};

export function redraw_func(callback) {
    let queued = false;
    return function redraw() {
        if (queued)
            return;

        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            callback();
        });
    }
}

export function resize_canvas_to_client_size(canvas, retina) {
    const dpr = retina ? window.devicePixelRatio : 1;
    const cw = dpr * canvas.clientWidth;
    const ch = dpr * canvas.clientHeight;
    if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        console.log('resize:', cw, ch);
    }
}

export function get_selector_or_element(selector_or_element) {
    if (typeof selector_or_element == 'string')
        return document.querySelector(selector_or_element);
    else if (selector_or_element instanceof HTMLElement)
        return selector_or_element;
    else
        return null;
}

export const assert = console.assert;

export const lerp = (a, b, u) => (1-u)*a + u*b;
export const clamp = (x, a, b) => x < a ? a : b < x ? b : x;
export const modulo = (x, n) => (x%n + n) % n;

export const PI2 = 2 * Math.PI;
export const DEG2RAD = Math.PI/180;
export const RAD2DEG = 1/DEG2RAD;

export function mat2d_get_scale(mat) {
    const c = (mat[0] + mat[3])/2;
    const s = (mat[1] - mat[2])/2;
    const scale = Math.sqrt(c*c + s*s);
    return scale;
}

export function canvas_context_transform_mat2d(ctx, mat) {
    ctx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
}

const zig = new Ziggurat;

export function random_gaussian(mu=0, sd=1) {
    return mu + sd*zig.nextGaussian();
}

export const expovariate = mu => -Math.log(1 - Math.random()) * mu;


export function each_line(text, callback) {
    var sp = 0;
    var lineno = 0;
    while (sp < text.length) {
        var ep = text.indexOf('\n', sp);
        if (ep == -1)
            ep = text.length;

        var line = text.substr(sp, ep - sp);
        sp = ep + 1;

        callback(line, lineno++);
    }
}
