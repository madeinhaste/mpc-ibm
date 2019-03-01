import './reloader';
import {mat4, vec2, vec3, vec4, quat} from 'gl-matrix';
import {lerp, clamp, random_gaussian, DEG2RAD, resize_canvas_to_client_size, redraw_func, $} from './utils';
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
        attribute vec3 a_coord;
        uniform mat4 u_mvp;
        uniform float u_pointsize;

        void main() {
            vec4 P = vec4(a_coord, 1.0);
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

const persp = {
    pos: vec3.create(),
    rot: quat.create(),
    fov: 30 * DEG2RAD,
    zrange: [10, 500],
    proj: mat4.create(),
    view: mat4.create(),
    viewproj: mat4.create(),
    viewproj_inv: mat4.create(),

    quad_verts: new Float32Array(8),
    quad_buf: null,
};
persp.quad_buf = create_buffer(gl.ARRAY_BUFFER, persp.quad_verts);

const spline = {
    cps: [0,0,0],
    strip: new Float32Array(),
    buffer: create_buffer(gl.ARRAY_BUFFER),
};

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

    // draw frustum quad
    pgm.uniformMatrix4fv('u_mvp', mvp);
    pgm.uniform4f('u_color', 1.0, 0.0, 0.3, 1.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, persp.quad_buf);
    pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINE_LOOP, 0, 4);
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
    draw_spline();
    draw_player();
}

function update_persp() {
    // caculate the 3d frame
    persp.pos[2] = -player.pos[0];
    persp.pos[1] = 0;
    persp.pos[0] = player.pos[1];

    const angle = -player.dir;   // don't add turb
    quat.setAxisAngle(persp.rot, [0,1,0], angle);

    // view matrix
    mat4.fromRotationTranslation(persp.view, persp.rot, persp.pos);
    mat4.invert(persp.view, persp.view);

    // projection matrix
    const aspect = 1920 / 1080;
    mat4.perspective(persp.proj, persp.fov, aspect, persp.zrange[0], persp.zrange[1]);

    // view-projection
    mat4.mul(persp.viewproj, persp.proj, persp.view);
    mat4.invert(persp.viewproj_inv, persp.viewproj);
    //debug(mat4.str(persp.viewproj_inv));

    // extract frustum quad
    {
        let dp = 0;
        const v = vec4.create();
        function add(x, y) {
            vec4.set(v, x, 0, y, 1);
            vec4.transformMat4(v, v, persp.viewproj_inv);
            persp.quad_verts[dp + 0] = -v[2] / v[3];
            persp.quad_verts[dp + 1] = v[0] / v[3];
            dp += 2;
        }

        add(-1, -1); add(1, -1); add(1, 1); add(-1, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, persp.quad_buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, persp.quad_verts);

        //debug(persp.quad_verts.map(v => v.toFixed(2)).join('\n'));
    }
}

function update_spline() {
    const cps = spline.cps;
    let n_cps = spline.cps.length;

    if (1) {
        const cps = spline.cps;

        // calc near and far points
        const cam_zmax = persp.pos[2] - persp.zrange[0];
        const cam_zmin = persp.pos[2] - persp.zrange[1];

        // count elements >= zmax
        {
            let count = 0;
            for (let i = 0; i < cps.length; i += 3) {
                const z = cps[i + 2];
                if (z < cam_zmax)
                    break;
                ++count;
            }

            // keep one for spline
            count -= 2;

            if (count > 0 && (cps.length/3 > 3)) {
                cps.splice(0, 3*count);
            }
        }

        // advance
        {
            // need to ensure N are <= cam_zmin

            let n_cps = cps.length/3;
            let count = 0;
            let min_count = 3;
            for (let i = n_cps - 1; i >= 0; --i) {
                const dp = 3*i;
                const z = cps[dp + 2];
                if (z <= cam_zmin)
                    ++count;
                if (count >= min_count)
                    break;
            }

            let dp = 3*n_cps;
            while (count < min_count) {
                const x0 = cps[dp - 3];
                const y0 = cps[dp - 2];
                const z0 = cps[dp - 1];

                const x1 = x0 + random_gaussian(0, 50);
                const y1 = y0 + random_gaussian(0, 50);
                const z1 = z0 - random_gaussian(100, 5);

                cps.push(x1, y1, z1);
                dp += 3;
                ++count;
            }
        }

        debug(`cps: ${cps.length/3}`);
    }

    // XXX maybe only on increase?
    const divs = 4;
    if (spline.strip.length !== divs * cps.length) {
        spline.strip = new Float32Array(divs * cps.length);
        gl.bindBuffer(gl.ARRAY_BUFFER, spline.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, spline.strip, gl.STATIC_DRAW);
    }

    {
        const out = spline.strip;
        // build catrom spline
        const n_cps = cps.length;
        let dp = 0;
        for (let i = 1; i < n_cps-2; ++i) {
            const sp0 = 3*(i-1);
            const sp1 = 3*i;
            const sp2 = 3*(i+1);
            const sp3 = 3*(i+2);

            const x0 = cps[sp0 + 0];
            const y0 = cps[sp0 + 1];
            const z0 = cps[sp0 + 2];

            const x1 = cps[sp1 + 0];
            const y1 = cps[sp1 + 1];
            const z1 = cps[sp1 + 2];

            const x2 = cps[sp2 + 0];
            const y2 = cps[sp2 + 1];
            const z2 = cps[sp2 + 2];

            const x3 = cps[sp3 + 0];
            const y3 = cps[sp3 + 1];
            const z3 = cps[sp3 + 2];

            for (let j = 0; j < divs; ++j) {
                const t = j/divs;
                const tt = t * t;
                const ttt = t * tt;

                const b0 = 0.5 * (-ttt + 2.0*tt - 1.0*t);
                const b1 = 0.5 * (3.0*ttt - 5.0*tt + 2.0);
                const b2 = 0.5 * (-3.0*ttt + 4.0*tt + t);
                const b3 = 0.5 * (ttt - tt);

                const u = j/divs;
                out[dp + 0] = b0*x0 + b1*x1 + b2*x2 + b3*x3;
                out[dp + 1] = b0*y0 + b1*y1 + b2*y2 + b3*y3;
                out[dp + 2] = b0*z0 + b1*z1 + b2*z2 + b3*z3;
                dp += 3;
            }
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, spline.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, out);
    }
}

const mat_3d_to_2d = mat4.fromValues(
    0, 1, 0, 0,
    0, 0, 0, 0,
    -1, 0, 0, 0,
    0, 0, 0, 1,
);

function draw_spline() {
    const pgm = simple_program.use();

    mat4.mul(mat, mvp, mat_3d_to_2d);
    pgm.uniformMatrix4fv('u_mvp', mat);
    pgm.uniform4f('u_color', 1.0, 0.8, 0.2, 1.0);

    // how do i draw into the ortho space?

    const n_verts = spline.strip.length / 3;
    if (n_verts) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.bindBuffer(gl.ARRAY_BUFFER, spline.buffer);
        pgm.vertexAttribPointer('a_coord', 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_STRIP, 0, n_verts);
        pgm.uniform1f('u_pointsize', 3);
        gl.drawArrays(gl.POINTS, 0, n_verts);
        gl.disable(gl.BLEND);
    }
}

function animate() {
    requestAnimationFrame(animate);
    update();
    update_persp();
    update_spline();
    draw();
}

animate();
