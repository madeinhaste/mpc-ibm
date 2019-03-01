import './reloader';
import {mat4, vec2, vec3, vec4, quat} from 'gl-matrix';
import {lerp, clamp, random_gaussian, DEG2RAD, resize_canvas_to_client_size, redraw_func, $} from './utils';
import {create_gl, create_buffer, create_program, create_texture, GLSL} from './webgl';

const canvas = $('canvas');
const gl = create_gl(canvas);
const gl_ext = {
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
};
//console.log(gl.getContextAttributes());

const simple_program = create_program({
    name: 'simple',
    vertex: GLSL`
        attribute vec3 a_position;
        uniform mat4 u_mvp;
        uniform float u_pointsize;

        void main() {
            vec4 P = vec4(a_position, 1.0);
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

const grid_program = create_program({
    name: 'grid',
    vertex: GLSL`
        attribute vec2 a_coord;
        varying vec2 v_coord;
        uniform mat4 u_mvp;
        uniform float u_scale;

        void main() {
            vec4 P = vec4(u_scale * a_coord, 0.0, 1.0);
            gl_Position = u_mvp * P;
            v_coord = a_coord;
        }
    `,
    fragment: GLSL`
        precision highp float;
        varying vec2 v_coord;
        uniform vec4 u_color;
        uniform float u_scale;
        uniform sampler2D u_tex;

        void main() {
            vec2 uv = u_scale * v_coord;
            gl_FragColor = u_color * texture2D(u_tex, uv);
        }
    `,
});

const persp = {
    pos: vec3.create(),
    rot: quat.create(),
    fov: 30 * DEG2RAD,
    zrange: [1, 1000],
    proj: mat4.create(),
    view: mat4.create(),
    viewproj: mat4.create(),
    viewproj_inv: mat4.create(),
};
vec3.set(persp.pos, 0, 3, 20);

const rot_target = quat.create();

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

const mat = mat4.create();

const draw_grid = (() => {
    /*
    const v = [];
    const div = 100;
    for (let i = 0; i <= div; ++i) {
        const u = i / div;
        const x = lerp(-1, 1, u);
        v.push(-1, x, 1, x);
        v.push(x, -1, x, 1);
    }
    */
    const v = [-1, -1, 1, -1, -1, 1, 1, 1];
    const n_verts = v.length/2;
    const buffer = create_buffer(gl.ARRAY_BUFFER, new Float32Array(v));

    let tex;
    {
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d');
        const cw = c.width = c.height = 512;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cw, cw);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cw/2, cw/2, 20, 0, 2*Math.PI);
        ctx.fill();
        ctx.fillRect(0, ~~(cw/2), cw, 3);
        ctx.fillRect(~~(cw/2), 0, 3, cw);
        tex = create_texture({
            size: cw,
            image: c,
            wrap: gl.REPEAT,
            min: gl.LINEAR_MIPMAP_LINEAR,
        });

        gl.texParameterf(gl.TEXTURE_2D, gl_ext.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 16);
        gl.generateMipmap(gl.TEXTURE_2D);
    }

    return function() {
        const pgm = grid_program.use();
        mat4.identity(mat);

        mat4.rotateX(mat, mat, 0.5*Math.PI);
        mat4.mul(mat, persp.viewproj, mat);

        pgm.uniformMatrix4fv('u_mvp', mat);
        pgm.uniform4f('u_color', 0.5, 0.8, 0.5, 1.0);
        pgm.uniform1f('u_scale', 10000);
        pgm.uniformSampler2D('u_tex', tex);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, n_verts);
    };
})();

function draw() {
    resize_canvas_to_client_size(canvas);

    const cw = canvas.width;
    const ch = canvas.height;
    gl.viewport(0, 0, cw, ch);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    draw_grid();
    //draw_spline();
}

function update_persp() {
    // view matrix
    mat4.fromRotationTranslation(persp.view, persp.rot, persp.pos);
    mat4.invert(persp.view, persp.view);

    // projection matrix
    const aspect = canvas.width / canvas.height;
    mat4.perspective(persp.proj, persp.fov, aspect, persp.zrange[0], persp.zrange[1]);

    // view-projection
    mat4.mul(persp.viewproj, persp.proj, persp.view);
    mat4.invert(persp.viewproj_inv, persp.viewproj);
}

function update_spline() {
    const cps = spline.cps;
    let n_cps = spline.cps.length;
    let dirty = false;

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
                dirty = true;
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
                dirty = true;
            }
        }

        debug(`cps: ${cps.length/3}`);
    }

    if (!dirty)
        return;

    // XXX maybe only on increase?
    const divs = 4;
    if (spline.strip.length !== divs * cps.length) {
        spline.strip = new Float32Array(divs * cps.length);
        gl.bindBuffer(gl.ARRAY_BUFFER, spline.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, spline.strip, gl.STATIC_DRAW);
        //console.log('spline: realloc', spline.strip.length/3);
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
        //console.log('spline: rebuild');
    }
}

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

const V = vec3.create();

function animate() {
    requestAnimationFrame(animate);

    vec3.set(V, 0, 0.1, -1);
    vec3.transformQuat(V, V, persp.rot);
    vec3.scaleAndAdd(persp.pos, persp.pos, V, 0.05);

    // gravity
    persp.pos[1] -= 0.1 * 0.05;

    debug(`lat: ${persp.pos[0].toFixed(3)} alt: ${persp.pos[1].toFixed(3)}`);

    //vec3.set(V, 0, 1, 0);
    //vec3.transformQuat(V, V, persp.rot);
    //vec3.scaleAndAdd(persp.pos, persp.pos, V, 0.01);
    //persp.pos[2] -= 0.05;

    quat.lerp(persp.rot, persp.rot, rot_target, 0.005);
    quat.normalize(persp.rot, persp.rot);

    update_persp();
    //update_spline();
    draw();
}

animate();

document.onmousemove = e => {
    const mx = 2*(e.offsetX / canvas.width) - 1;
    const my = 2*(e.offsetY / canvas.height) - 1;

    quat.identity(rot_target);
    quat.rotateZ(rot_target, rot_target, -mx * 60 * DEG2RAD);
    quat.rotateX(rot_target, rot_target, -my * 30 * DEG2RAD);
};
