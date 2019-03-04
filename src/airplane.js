import './reloader';
import {mat4, vec2, vec3, vec4, quat} from 'gl-matrix';
import {lerp, clamp, random_gaussian, DEG2RAD, resize_canvas_to_client_size, redraw_func, $} from './utils';
import {create_gl, create_buffer, create_program, create_texture, GLSL} from './webgl';
import {init_clouds, update_clouds, draw_clouds} from './clouds';

const worker = new Worker('./bundles/trail-worker-3d.bundle.js');

const canvas = $('canvas');
const gl = create_gl(canvas);
const gl_ext = {
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
    instanced: gl.getExtension('ANGLE_instanced_arrays'),
};
//console.log(gl.getContextAttributes());
let fog_enabled = true;
let grid_enabled = true;
let wireframe = false;

const simple_program = create_program({
    name: 'simple',
    vertex: GLSL`
        attribute vec3 a_position;
        varying float v_fog;
        uniform mat4 u_mvp;
        uniform mat4 u_view;
        uniform float u_pointsize;
        uniform vec2 u_fogrange;

        void main() {
            vec4 P = vec4(a_position, 1.0);

            {
                float z = -(u_view * P).z;
                float fog = 1.0 - clamp(
                    (z - u_fogrange[0]) / (u_fogrange[1] - u_fogrange[0]),
                    0.0,
                    1.0);
                v_fog = fog * fog;
            }

            gl_Position = u_mvp * P;
            gl_PointSize = u_pointsize;
        }
    `,
    fragment: GLSL`
        precision highp float;
        varying float v_fog;
        uniform vec4 u_color;

        void main() {
            gl_FragColor = v_fog * u_color;
        }
    `,
});

const trail_program = create_program({
    name: 'simple',
    vertex: GLSL`
        attribute vec3 a_position;
        varying float v_fog;
        uniform mat4 u_mvp;
        uniform mat4 u_view;
        uniform float u_pointsize;
        uniform vec2 u_fogrange;

        void main() {
            vec4 P = vec4(a_position, 1.0);

            {
                float z = -(u_view * P).z;
                float fog = 1.0 - clamp(
                    (z - u_fogrange[0]) / (u_fogrange[1] - u_fogrange[0]),
                    0.0,
                    1.0);
                v_fog = fog * fog;
            }

            gl_Position = u_mvp * P;
            gl_PointSize = u_pointsize;
        }
    `,
    fragment: GLSL`
        precision highp float;
        varying float v_fog;
        uniform vec4 u_color;

        void main() {
            float f = 1.0 - v_fog;
            gl_FragColor = vec4(f, f, f, 1.0);
        }
    `,
});

const grid_program = create_program({
    name: 'grid',
    vertex: GLSL`
        attribute vec2 a_coord;
        varying vec2 v_coord;
        uniform mat4 u_mvp;
        uniform vec2 u_scale;

        void main() {
            vec4 P = vec4(u_scale.x * (a_coord-0.5), 0.0, 1.0);
            gl_Position = u_mvp * P;
            v_coord = a_coord;
        }
    `,
    fragment: GLSL`
        precision highp float;
        varying vec2 v_coord;
        uniform vec4 u_color;
        uniform vec2 u_scale;
        uniform sampler2D u_tex;

        void main() {
            vec2 uv = u_scale.y * v_coord;
            gl_FragColor = u_color * texture2D(u_tex, uv);
        }
    `,
});

let aerial = false;
let speed = 1.0;

const persp = {
    pos: vec3.create(),
    rot: quat.create(),
    fov: 30 * DEG2RAD,
    zrange: [0.1, 500],
    proj: mat4.create(),
    view: mat4.create(),
    viewproj: mat4.create(),
    viewproj_inv: mat4.create(),
};
vec3.set(persp.pos, 0, 3, 120);

const rot_target = quat.create();

let fog_disabled_range = vec2.fromValues(-Infinity, Infinity);
function get_fog_range() {
    return fog_enabled ? persp.zrange : fog_disabled_range;
}

const spline = {
    cps: [0,3,200],
    strip: new Float32Array(),
    buffer: create_buffer(gl.ARRAY_BUFFER),
};

const trails = [];
const max_num_trails = 100;
let next_trail_spawn_time = 0;
const trail_spawn_interval = 500;

const debug = (function() {
    const el = $('.debug');
    return s => {
        el.innerHTML = s;
    };
}());

const box = {
    verts: null,
    elems: null,
    count: 0,
};

{
    // cube geometry
    const points = [];
    for (let i = 0; i < 8; ++i) {
        const x = 2*((i & 1)>>0) - 1;
        const y = 2*((i & 2)>>1) - 1;
        const z = 2*((i & 4)>>2) - 1;
        points.push(x, y, z);
    }

    const indices = [
        0,1, 1,3, 3,2, 2,0, 
        4,5, 5,7, 7,6, 6,4,
        0,4, 2,6, 1,5, 3,7,
    ];

    box.verts = create_buffer(gl.ARRAY_BUFFER, new Float32Array(points));
    box.elems = create_buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices));
    box.count = indices.length;
}

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
    const v = [0, 0, 1, 0, 0, 1, 1, 1];
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
        pgm.uniform2f('u_scale', 10000, aerial ? 500 : 10000);
        pgm.uniformSampler2D('u_tex', tex);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, n_verts);
        gl.disable(gl.BLEND);
    };
})();

init_clouds();
update_clouds(persp, true);

function draw() {
    resize_canvas_to_client_size(canvas, false);

    const cw = canvas.width;
    const ch = canvas.height;
    gl.viewport(0, 0, cw, ch);

    if (aerial)
        gl.clearColor(0, 0, 0, 1);
    else
        gl.clearColor(.271, .518, .706, 1)
    gl.clear(gl.COLOR_BUFFER_BIT);

    grid_enabled && draw_grid();
    draw_spline();
    draw_trails();
    draw_clouds(persp, get_fog_range(), gl_ext.instanced, wireframe);

    if (aerial) {
        // draw frustum
        const pgm = simple_program.use();

        mat4.identity(mat);
        mat4.mul(mat, persp.viewproj, persp.viewproj_inv);

        pgm.uniformMatrix4fv('u_mvp', mat);
        pgm.uniformMatrix4fv('u_view', persp.view);

        pgm.uniform4f('u_color', 1.0, 0.0, 0.2, 1.0);
        pgm.uniform2fv('u_fogrange', get_fog_range());

        gl.bindBuffer(gl.ARRAY_BUFFER, box.verts);
        pgm.vertexAttribPointer('a_position', 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, box.elems);
        gl.drawElements(gl.LINES, box.count, gl.UNSIGNED_SHORT, 0);
    }
}

const mat_3d_to_2d = mat4.fromValues(
    0, 1, 0, 0,
    0, 0, 0, 0,
    -1, 0, 0, 0,
    0, 0, 0, 1,
);

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

    if (aerial) {
        // overwrite with ortho camera
        const cw = canvas.width;
        const ch = canvas.height;
        mat4.ortho(persp.proj, 0, cw, 0, ch, -1, 1);

        // set view
        mat4.identity(persp.view);
        mat4.translate(persp.view, persp.view, [100, ch/2, 0]);
        mat4.mul(persp.view, persp.view, mat_3d_to_2d);

        const pos = persp.pos;
        mat4.translate(persp.view, persp.view, [-pos[0], -pos[1], -pos[2]]);

        mat4.mul(persp.viewproj, persp.proj, persp.view);
    }
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

                const x1 = x0 + random_gaussian(0, 5);
                const y1 = y0 + random_gaussian(0, 5);
                const z1 = z0 - random_gaussian(50, 0);

                cps.push(x1, y1, z1);
                dp += 3;
                ++count;
                dirty = true;
            }
        }

        //debug(`cps: ${cps.length/3}`);
    }

    if (!dirty)
        return;

    // XXX maybe only on increase?
    //const divs = 16;
    const divs = 8;
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

function find_or_create_new_trail() {
    let trail;
    for (let i = 0; i < trails.length; ++i) {
        trail = trails[i];
        if (!trail.alive)
            return trail;
    }

    trail = {
        alive: false,
        bounds: null,
        n_points: 0,
        buffer: null,
    };
    trails.push(trail);
    return trail;
}

// buffer for potential field visualization
const potential = {
    buffer: gl.createBuffer(gl.ARRAY_BUFFER),
    count: 0,
};

worker.onmessage = function(e) {
    const data = e.data;

    if (data.type == 'P') {
        // potential field
        const points = new Float32Array(data.points);
        gl.bindBuffer(gl.ARRAY_BUFFER, potential.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
        potential.count = points.length/3;
    }
    else
    {
        // trail data
        const trail = find_or_create_new_trail();
        const points = new Float32Array(data.points);
        trail.buffer = create_buffer(gl.ARRAY_BUFFER, points);
        trail.n_points = points.length/3;
        trail.bounds = data.bounds;
        trail.alive = true;
    }
};

function request_potential() {
    const zmax = persp.pos[2] - persp.zrange[0];
    const zmin = persp.pos[2] - persp.zrange[1];
    const z = (zmin + zmax)/2;
    const r = (zmax - zmin)/2;

    worker.postMessage({
        type: 'P',
        bounds: [-r, -r, zmin-200, r, r, zmax-200],
        count: 100,
    });
}

function update_trails() {
    const min_z = spline.cps[spline.cps.length-1];
    const max_z = spline.cps[2];
    //debug(`min: ${min_z}  max: ${max_z}`);

    // prune & count live trails
    let alive_count = 0;
    trails.forEach(trail => {
        if (!trail.alive)
            return;

        if (trail.bounds[2] >= max_z) {
            trail.alive = false;
            trail.n_points = 0;
            gl.deleteBuffer(trail.buffer);
            trail.buffer = null;
        } else {
            ++alive_count;
        }
    });

    const now = performance.now();
    if (now >= next_trail_spawn_time &&
        alive_count < max_num_trails)
    {
        // spawn trail here
        next_trail_spawn_time = now + trail_spawn_interval;

        const start = vec3.create();

        {
            // start somewhere near last control point
            const sp = spline.cps.length - 3;
            start[0] = spline.cps[sp + 0];
            start[1] = spline.cps[sp + 1];
            start[2] = spline.cps[sp + 2];

            const r = lerp(10, 20, Math.random());
            const t = 2 * Math.PI * Math.random();
            start[0] += r * Math.cos(t);
            start[1] += r * Math.sin(t);
        }

        worker.postMessage({ start, count: 200 });
    }
}

function draw_trails() {
    const pgm = trail_program.use();

    pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
    pgm.uniformMatrix4fv('u_view', persp.view);
    //pgm.uniform4f('u_color', 1.0, 0.1, 0.7, 1.0);
    pgm.uniform4f('u_color', 0, 0, 0, 1);
    pgm.uniform2fv('u_fogrange', get_fog_range());

    gl.enable(gl.BLEND);
    //gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    gl.lineWidth(3);
    for (let i = 0; i < trails.length; ++i) {
        const trail = trails[i];
        if (!trail.alive)
            continue;

        gl.bindBuffer(gl.ARRAY_BUFFER, trail.buffer);
        pgm.vertexAttribPointer('a_position', 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_STRIP, 0, trail.n_points);
        //pgm.uniform1f('u_pointsize', 3);
        //gl.drawArrays(gl.POINTS, 0, n_verts);
    }

    if (potential.count) {
        gl.bindBuffer(gl.ARRAY_BUFFER, potential.buffer);
        pgm.vertexAttribPointer('a_position', 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, potential.count);
    }

    gl.lineWidth(1);
    gl.disable(gl.BLEND);
}

function draw_spline() {
    const pgm = simple_program.use();

    //mat4.mul(mat, mvp, mat_3d_to_2d);
    pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
    pgm.uniformMatrix4fv('u_view', persp.view);
    pgm.uniform4f('u_color', 1.0, 0.8, 0.2, 1.0);
    pgm.uniform2fv('u_fogrange', get_fog_range());

    // how do i draw into the ortho space?
    const n_verts = spline.strip.length / 3;
    if (n_verts) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.bindBuffer(gl.ARRAY_BUFFER, spline.buffer);
        pgm.vertexAttribPointer('a_position', 3, gl.FLOAT, false, 0, 0);
        gl.lineWidth(10);
        gl.drawArrays(gl.LINE_STRIP, 0, n_verts);
        //pgm.uniform1f('u_pointsize', 3);
        //gl.drawArrays(gl.POINTS, 0, n_verts);
        gl.lineWidth(1);
        gl.disable(gl.BLEND);
    }
}

const V = vec3.create();

function update_player() {
    //const speed = 1.0;

    vec3.set(V, 0, 0.3, -1);
    vec3.transformQuat(V, V, persp.rot);
    vec3.scaleAndAdd(persp.pos, persp.pos, V, 0.05*speed);

    // gravity
    persp.pos[1] -= 0.3 * 0.05 * speed;

    debug(`lat: ${persp.pos[0].toFixed(3)}  alt: ${persp.pos[1].toFixed(3)}  speed: ${speed.toFixed(3)}`);

    if (aerial)
        quat.identity(rot_target);

    quat.lerp(persp.rot, persp.rot, rot_target, 0.01);
    quat.normalize(persp.rot, persp.rot);
}

function animate() {
    requestAnimationFrame(animate);

    update_player();
    update_persp();
    update_spline();
    update_trails();
    update_clouds(persp, false);
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

document.onkeydown = e => {
    if (e.code == 'KeyA') {
        aerial = !aerial;
        debug(aerial ? 'aerial' : 'persp');
        e.preventDefault();
    }

    if (e.code == 'KeyP') {
        request_potential();
        e.preventDefault();
    }

    if (e.code == 'KeyF') {
        fog_enabled = !fog_enabled;
        e.preventDefault();
    }

    if (e.code == 'KeyW') {
        wireframe = !wireframe;
        e.preventDefault();
    }

    if (e.code == 'KeyG') {
        grid_enabled = !grid_enabled;
        e.preventDefault();
    }
};

document.onmousewheel = e => {
    const dy = -e.deltaY/53;
    speed = clamp(speed * (1 + 0.1*dy), 1, 50);
    e.preventDefault();
};
