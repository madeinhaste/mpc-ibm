import './reloader';
import {mat4, vec2} from 'gl-matrix';
import {resize_canvas_to_client_size, redraw_func, $} from './utils';
import {camera, player, update, trails, trail_hooks, route, STATE_ALIVE} from './plane-game.js';
import {create_gl, create_buffer, create_program, GLSL} from './webgl';

const canvas = $('canvas');
const gl = create_gl(canvas);
console.log(gl.getContextAttributes());

trail_hooks.init_path = points => create_buffer(gl.ARRAY_BUFFER, points);
trail_hooks.free_path = buffer => gl.deleteBuffer(buffer);

const simple_program = create_program({
    name: 'simple',
    vertex: GLSL`
        attribute vec2 a_coord;
        uniform mat4 u_mvp;
        uniform float u_pointsize;

        void main() {
            vec4 P = vec4(a_coord, 0.0, 1.0);
            gl_Position = u_mvp * P;
            gl_PointSize = u_pointsize;
        }
    `,
    fragment: GLSL`
        precision highp float;
        uniform vec4 u_color;

        void main() {
            gl_FragColor = u_color;
        }
    `,
});

const mvp = mat4.create();
const mat = mat4.create();

const debug = (function() {
    const el = $('.debug');
    return s => {
        el.innerHTML = s;
    };
}());

function draw_trails() {
    const pgm = simple_program.use();
    pgm.uniformMatrix4fv('u_mvp', mvp);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    for (let i = 0; i < trails.length; ++i) {
        const trail = trails[i];
        if (trail.state !== STATE_ALIVE)
            continue;

        if (!trail.n_points)
            continue;

        gl.bindBuffer(gl.ARRAY_BUFFER, trail.path);
        pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);
        pgm.uniform4f('u_color', 0.2, 0.9, 0.8, trail.alpha);
        gl.drawArrays(gl.LINE_STRIP, 0, trail.n_points);
    }

    gl.disable(gl.BLEND);
}

const player_verts = new Float32Array([
    -10, 7, 10, 0, -10, -7
]);
const player_buf = create_buffer(gl.ARRAY_BUFFER, player_verts);

function draw_player() {
    mat4.identity(mat);
    mat4.translate(mat, mat, [player.pos[0], player.pos[1], 0]);
    const angle = player.dir + player.turb;
    mat4.rotateZ(mat, mat, angle);
    mat4.mul(mat, mvp, mat);

    const pgm = simple_program.use();
    pgm.uniformMatrix4fv('u_mvp', mat);
    pgm.uniform4f('u_color', 0.0, 1.0, 0.3, 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, player_buf);
    pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

let route_verts, route_buf;

function draw_route() {
    if (!route_verts) {
        route_verts = new Float32Array(route.length * 2);
        let dp = 0;
        route.forEach(r => {
            route_verts[dp++] = r.x;
            route_verts[dp++] = r.y;
        });
        route_buf = create_buffer(gl.ARRAY_BUFFER, route_verts);
    }

    const pgm = simple_program.use();
    pgm.uniformMatrix4fv('u_mvp', mvp);
    pgm.uniform4f('u_color', 0.8, 0.0, 0.5, 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, route_buf);
    pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINE_STRIP, 0, route.length);
    pgm.uniform1f('u_pointsize', 7);
    gl.drawArrays(gl.POINTS, 0, route.length);
}

const grid_verts = new Float32Array(1024);
const grid_buf = create_buffer(gl.ARRAY_BUFFER, grid_verts);

function draw_grid() {
    const cw = canvas.width;
    const ch = canvas.height;

    const div = 100;
    const x0 = Math.ceil(-camera.t[0] / div);
    const x1 = Math.floor((-camera.t[0] + cw) / div);

    const y0 = Math.ceil(-camera.t[1] / div);
    const y1 = Math.floor((-camera.t[1] + ch) / div);

    let dp = 0;
    for (let y = y0; y <= y1; ++y) {
        for (let x = x0; x <= x1; ++x) {
            grid_verts[dp++] = div*x;
            grid_verts[dp++] = div*y;
        }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, grid_buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, grid_verts);

    const pgm = simple_program.use();
    pgm.uniformMatrix4fv('u_mvp', mvp);
    pgm.uniform4f('u_color', 0.5, 0.8, 0.5, 1.0);
    pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);
    pgm.uniform1f('u_pointsize', 1.5);
    gl.drawArrays(gl.POINTS, 0, dp>>1);
}

function draw() {
    resize_canvas_to_client_size(canvas);

    const cw = canvas.width;
    const ch = canvas.height;
    gl.viewport(0, 0, cw, ch);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    mat4.identity(mvp);
    {
        const tx = camera.t[0];
        const ty = camera.t[1];
        mat4.ortho(mvp, -tx, cw-tx, ch-ty, -ty, -1, 1);
    }

    draw_grid();
    draw_trails();
    draw_route();
    draw_player();
}

function animate() {
    requestAnimationFrame(animate);
    update();
    draw();
}

animate();
