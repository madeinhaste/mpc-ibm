import './reloader';
import {vec2} from 'gl-matrix';
import {resize_canvas_to_client_size, redraw_func, $} from './utils';
import {camera, player, update, trails, trail_hooks, route, STATE_ALIVE} from './plane-game.js';

trail_hooks.init_path = points => {
    const path = new Path2D();
    for (let i = 0; i < points.length; i += 2) {
        const x = points[i];
        const y = points[i+1];
        i ? path.lineTo(x, y) : path.moveTo(x, y);
    }
    return path;
};

const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const debug = (function() {
    const el = $('.debug');
    return s => {
        el.innerHTML = s;
    };
}());

const redraw = redraw_func(draw);
window.onresize = redraw;
redraw();

function draw_trails() {
    ctx.strokeStyle = '#2c8';
    for (let i = 0; i < trails.length; ++i) {
        const trail = trails[i];
        if (trail.state !== STATE_ALIVE)
            continue;

        ctx.globalAlpha = trail.alpha;
        ctx.stroke(trail.path);
    }
}

function draw_player() {
    ctx.save();
    ctx.translate(player.pos[0], player.pos[1]);
    ctx.rotate(player.dir + player.turb);
    ctx.beginPath();
    ctx.moveTo(-10, 7);
    ctx.lineTo(10, 0);
    ctx.lineTo(-10, -7);
    ctx.closePath();
    ctx.fillStyle = '#0f0';
    ctx.fill();
    ctx.restore();
}

function draw_route() {
    const q = 10;
    ctx.strokeStyle = '#f08';

    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    for (let i = 0; i < route.length; ++i) {
        const r = route[i];
        if (i)
            ctx.lineTo(r.x, r.y);
        else
            ctx.moveTo(r.x, r.y);
    }
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < route.length; ++i) {
        const r = route[i];
        ctx.moveTo(r.x - q, r.y - q);
        ctx.lineTo(r.x + q, r.y + q);
        ctx.moveTo(r.x - q, r.y + q);
        ctx.lineTo(r.x + q, r.y - q);
    }
    ctx.stroke();

}

function draw_grid() {
    const cw = canvas.width;
    const ch = canvas.height;

    const div = 100;
    const x0 = Math.ceil(-camera.t[0] / div);
    const x1 = Math.floor((-camera.t[0] + cw) / div);

    const y0 = Math.ceil(-camera.t[1] / div);
    const y1 = Math.floor((-camera.t[1] + ch) / div);

    ctx.fillStyle = '#08c';
    for (let y = y0; y <= y1; ++y) {
        for (let x = x0; x <= x1; ++x) {
            ctx.fillRect(div*x, div*y, 1, 1);
        }
    }
}

function draw() {
    resize_canvas_to_client_size(canvas);
    const cw = canvas.width;
    const ch = canvas.height;

    // clear the canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    // apply camera
    ctx.save();
    ctx.translate(camera.t[0], camera.t[1]);

    draw_grid();
    draw_trails();
    draw_route();
    draw_player();

    ctx.restore();
}

function animate() {
    requestAnimationFrame(animate);
    update();
    draw();
}

animate();
