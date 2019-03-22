import './reloader';
import {mat3, mat4, vec2, vec3, vec4, quat} from 'gl-matrix';
import {assert, lerp, clamp, random_gaussian, DEG2RAD, resize_canvas_to_client_size, redraw_func, $} from './utils';
import {create_gl, create_buffer, create_program, create_texture, GLSL} from './webgl';
import {init_clouds, update_clouds, draw_clouds} from './clouds';
import {init_trails} from './trails';
import {sample_cps, sample_cps_position} from './misc';
import {Howl, Howler} from 'howler';
import SimplexNoise from 'simplex-noise';
import * as dat from 'dat.gui';
import {init_text} from './airplane-text';
import {FCurve} from './fcurve';

function get_hash_options() {
    let opts = {};
    let h = location.hash.substr(1);
    if (h.length == 0)
        return opts;
    h.split(',').forEach(s => {
        let a = s.split('=');
        let k = a[0];
        if (a.length == 1)
            opts[k] = true;
        else
            opts[k] = a[1];
    });
    return opts;
}
const options = get_hash_options();
console.log('options:', options)

const canvas = $('canvas');
const gl = create_gl(canvas, {
    premultipliedAlpha: false,
    alpha: false,
});
console.log(gl.getContextAttributes());

const gl_ext = {
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
    instanced: gl.getExtension('ANGLE_instanced_arrays'),
};
let fog_enabled = true;
let grid_enabled = false;
let wireframe = false;
let autopilot_enabled = false;
let cockpit_visible = false;
let clouds_enabled = true;
let trails_enabled = false;
let developer_enabled = !!options.dev;
let debug_enabled = false;
let mouse_enabled = !developer_enabled;
show_cockpit(cockpit_visible);

const params = {
    fade: 0,
    sky_blend: 0,
    sun_color: [255,135,0],
    sun_strength: 1.5,
    ambient_shading: 0.53,
    cloud_scale: 1.3,
    cloud_rotate: 1.0,
    guide_color_0: [140, 140, 140],
    guide_color_1: [65, 65, 65],
    guide_ymin: 15,
    guide_ymax: 24,
    guide_wander: 5.6,
    guide_advance: 70,
    guide_rebuild() { reinitialize_spline() },
    trail_color_0: [0, 0xb4, 0xa0],
    trail_color_1: [0x5a, 0xa7, 0],
    trail_blend: 'add',
    trail_width: 0.5,
    trail_amount: 32,
};

const sounds = {
    ambience: new Howl({
        src: ['sounds/ambience.mp4'],
        autoplay: true,
        loop: true,
    }),
    bing: new Howl({
        src: ['sounds/bing.mp4'],
    }),
};
let next_bing_time = 0;
const bing_interval = 3000;

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

const spline_program = create_program({
    name: 'spline',
    vertex: GLSL`
        attribute vec3 a_position;
        attribute vec3 a_P;
        attribute vec4 a_Q;

        varying float v_fog;
        varying float v_fade;
        varying float v_gradient;
        uniform mat4 u_mvp;
        uniform mat4 u_view;
        uniform vec2 u_fogrange;
        uniform vec2 u_scale;

        vec3 transform_quat(vec3 v, vec4 q) {
            vec3 t = 2.0 * cross(q.xyz, v);
            return v + q.w*t + cross(q.xyz, t);
        }

        void main() {
            vec3 P;

            {
                P = vec3(u_scale[0]*a_position.xy, u_scale[1]*a_position.z);
                P = a_P + transform_quat(P, a_Q);
                v_gradient = a_position.z;
            }

            {
                float z = -(u_view * vec4(P, 1.0)).z;
                float fog = 1.0 - clamp(
                    (z - u_fogrange[0]) / (u_fogrange[1] - u_fogrange[0]),
                    0.0,
                    1.0);
                v_fog = fog * fog;

                // fade out clouds as the approach near plane
                v_fade = pow(fog, 200.0);
            }

            gl_Position = u_mvp * vec4(P, 1.0);
        }
    `,
    fragment: GLSL`
        precision highp float;
        varying float v_fog;
        varying float v_fade;
        varying float v_gradient;
        uniform vec4 u_color0;
        uniform vec4 u_color1;

        void main() {
            gl_FragColor = v_fog * mix(u_color0, u_color1, v_gradient);
            gl_FragColor.a *= 0.250 * (1.0 - v_fade);
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

const sky_program = create_program({
    name: 'sky',
    vertex: GLSL`
        attribute vec2 a_position;
        varying vec3 v_dir;

        uniform mat4 u_proj_inv;
        uniform mat3 u_view_inv;

        void main() {
            vec4 P = vec4(a_position, 0.0, 1.0);

            {
                v_dir = u_view_inv * (u_proj_inv * P).xyz;
            }

            gl_Position = P;
        }
    `,
    fragment: GLSL`
    //precision highp float;
        precision mediump float;
        varying vec3 v_dir;
        uniform sampler2D u_texture0;
        uniform sampler2D u_texture1;
        uniform vec2 u_resolution;
        uniform float u_rotate;
        uniform float u_crossfade;

        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233)))*43758.5453123);
        }

        void main() {
            vec3 dir = normalize(v_dir);
            vec2 uv = vec2(
                (atan(dir.z, dir.x) / 6.283185307179586476925286766559) + 0.5,
                acos(dir.y) / 3.1415926535897932384626433832795);
            uv.x = fract(uv.x + u_rotate);
            //uv.x = 0.0;

            vec3 C = mix(
                texture2D(u_texture0, uv).rgb,
                texture2D(u_texture1, uv).rgb,
                u_crossfade);

            gl_FragColor = vec4(C, 1.0);
            /*
            vec2 uv = vec2(0.0, acos(dir.y) / 3.1415926535897932384626433832795);
            //uv.y += 0.01 * random(gl_FragCoord.xy / u_resolution);
            
            //uv = gl_FragCoord.xy / u_resolution;
            vec3 C = texture2D(u_texture, uv).rgb;
            C *= 0.5;
            gl_FragColor = vec4(C, 1.0);
            */
            //gl_FragColor.rg = uv;
        }
    `,
});

const fade_program = create_program({
    name: 'fade',
    vertex: GLSL`
        attribute vec2 a_coord;

        void main() {
            gl_Position = vec4(a_coord, 0.0, 1.0);
        }
    `,
    fragment: GLSL`
        precision mediump float;
        uniform vec4 u_color;

        void main() {
            gl_FragColor = u_color;
        }
    `,
});


const buf_fstri = create_buffer(gl.ARRAY_BUFFER, new Float32Array([ -1, -1, 3, -1, -1, 3 ]));

const sky_textures = [];

{
    // load sky textures
    const max_texture_size = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const size = (max_texture_size >= 8192) ? '8k' : '4k';
    console.log('MAX_TEXTURE_SIZE:', max_texture_size);

    const filenames = [
        `loc00184-22-${size}.jpg`,
        `loc00184-22-${size}-storm.jpg`,
    ];

    filenames.forEach(filename => {
        const tex = create_texture({ size: 128, min: gl.LINEAR, mag: gl.LINEAR });
        sky_textures.push(tex);

        const url = `images/${filename}`;
        const img = new Image;
        img.src = url;
        img.onload = _ => {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            console.log('loaded:', img.src);
        };
    });
}

let aerial = false;
let speed = 6.0;

const shake = {
    amount: 0,
    noise: Noise(1, 3),
    pos: vec3.create(),
    rot: quat.create(),
};

const persp = {
    pos: vec3.create(),
    rot: quat.create(),
    fov: 30,
    zrange: [0.1, 500],
    proj: mat4.create(),
    view: mat4.create(),
    viewproj: mat4.create(),
    viewproj_inv: mat4.create(),
};
vec3.set(persp.pos, 0, 20, 120);

const rot_target = quat.create();

let fog_disabled_range = vec2.fromValues(-Infinity, Infinity);
function get_fog_range() {
    return fog_enabled ? persp.zrange : fog_disabled_range;
}

const spline = {
    cps: [0,20,200],
    cp_start: 0,
    buffer: create_buffer(gl.ARRAY_BUFFER),
    debug_buffer: create_buffer(gl.ARRAY_BUFFER),
    n_shape_verts: 0,
    shape: null,
    n_verts: 0,
};

{
    // initialize spline and player position
    update_spline_cps();
    sample_cps(persp.pos, spline.cps, persp.pos[2]);
}

{
    const v = [];
    const n = 16;

    const r = 1.0;
    const ry = 1.0;

    for (let i = 0; i < n; ++i) {
        const theta = 2*Math.PI * i/(n-1);

        const x = r*Math.cos(theta);
        const y = ry*Math.sin(theta);

        v.push(x, y, 1);
        v.push(x, y, 0);
    }

    // cap
    for (let i = 0; i < n; ++i) {
        const theta = 2*Math.PI * i/(n-1);
        const r = 1.0;

        const x = r*Math.cos(theta);
        const y = ry*Math.sin(theta);

        v.push(x, y, 0);
        v.push(0, 0, 0);
    }

    spline.shape = create_buffer(gl.ARRAY_BUFFER, new Float32Array(v));
    spline.n_shape_verts = v.length / 3;
}

const debug = (function() {
    const el = $('.debug');
    return s => {
        if (s) {
            el.innerHTML = s;
            el.style.opacity = 1;
        } else {
            el.style.opacity = 0;
        }
    };
}());
debug();

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

const text = init_text();

const trails = init_trails();
function update_trails_palette() {
    trails.update_palette(params);
    //console.log('update palette');
}
update_trails_palette();

function draw() {
    resize_canvas_to_client_size(canvas, false);

    const cw = canvas.width;
    const ch = canvas.height;
    gl.viewport(0, 0, cw, ch);

    if (aerial) {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    } else {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        draw_sky();
    }

    grid_enabled && draw_grid();
    if (clouds_enabled)
        draw_clouds(persp, get_fog_range(), gl_ext.instanced, wireframe, params);
    draw_spline();

    if (trails_enabled) {
        const env = {
            persp: persp,
            shape_buffer: spline.shape,
            n_shape_verts: spline.n_shape_verts,
            ext: gl_ext,
            fog_range: get_fog_range(),
            params,
        };
        trails.draw(env);
    }

    if (1) {
        const env = {
            persp: persp,
            points: spline.cps,
            points_start: spline.cp_start,
            fog_range: get_fog_range(),
            params,
        };
        text.draw(env);
    }

    if (aerial) {
        // draw control points
        {
            gl.bindBuffer(gl.ARRAY_BUFFER, spline.debug_buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spline.cps), gl.STATIC_DRAW);

            const pgm = simple_program.use();
            pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
            pgm.uniformMatrix4fv('u_view', persp.view);

            pgm.uniform4f('u_color', 0.0, 1.0, 0.5, 0.5);
            pgm.uniform2fv('u_fogrange', get_fog_range());
            pgm.uniform1f('u_pointsize', 7);

            pgm.vertexAttribPointer('a_position', 3, gl.FLOAT, false, 0, 0);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.drawArrays(gl.LINE_STRIP, 0, spline.cps.length/3);
            gl.drawArrays(gl.POINTS, 0, spline.cps.length/3);
            gl.disable(gl.BLEND);

            // draw closest point
            pgm.uniform4f('u_color', 1.0, 0.0, 0.0, 0.5);
            pgm.uniform1f('u_pointsize', 9);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, closest_spline_pos);
            //gl.enable(gl.BLEND);
            //gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.drawArrays(gl.POINTS, 0, 1);
            //gl.disable(gl.BLEND);
        }

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
    else
    {
        // fade
        //if (params.fade > 0) {
        const f = params.fade;
        if (f > 0) {
            const pgm = fade_program.use();
            pgm.uniform4f('u_color', 1-f, 1-f, 1-f, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf_fstri);
            pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.DST_COLOR, gl.ZERO);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.disable(gl.BLEND);
        }
    }
}

const mat_3d_to_2d = mat4.fromValues(
    0, 1, 0, 0,
    0, 0, 0, 0,
    -1, 0, 0, 0,
    0, 0, 0, 1,
);

function update_persp() {
    vec3.add(shake.pos, persp.pos, shake.pos);
    quat.mul(shake.rot, persp.rot, shake.rot);

    // view matrix
    //mat4.fromRotationTranslation(persp.view, persp.rot, persp.pos);
    mat4.fromRotationTranslation(persp.view, shake.rot, shake.pos);
    mat4.invert(persp.view, persp.view);

    // projection matrix
    const aspect = canvas.width / canvas.height;
    mat4.perspective(persp.proj, persp.fov * DEG2RAD, aspect, persp.zrange[0], persp.zrange[1]);

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
        mat4.translate(persp.view, persp.view, [300, ch/2, 0]);
        mat4.mul(persp.view, persp.view, mat_3d_to_2d);

        const pos = persp.pos;
        mat4.translate(persp.view, persp.view, [-pos[0], -pos[1], -pos[2]]);

        mat4.mul(persp.viewproj, persp.proj, persp.view);
    }
}

function update_spline_cps() {
    const cps = spline.cps;
    let dirty = false;

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

            // update start index
            spline.cp_start += count;
            //console.log('removed:', count);
        }
    }

    // advance
    {
        // need to ensure N are <= cam_zmin
        const n_cps = cps.length/3;
        const min_count = 3;
        let count = 0;
        for (let i = n_cps - 1; i >= 0; --i) {
            const dp = 3*i;
            const z = cps[dp + 2];
            if (z <= cam_zmin)
                ++count;
            if (count >= min_count)
                break;
        }

        const ymin = params.guide_ymin;
        const ymax = params.guide_ymax;
        const wander = params.guide_wander;
        const advance = params.guide_advance;

        let dp = 3*n_cps;
        while (count < min_count) {
            const x0 = cps[dp - 3];
            const y0 = cps[dp - 2];
            const z0 = cps[dp - 1];

            const x1 = x0 + random_gaussian(0, wander);
            const y1 = clamp(y0 + random_gaussian(0, wander), ymin, ymax);
            const z1 = z0 - random_gaussian(advance, 0);

            cps.push(x1, y1, z1);
            dp += 3;
            ++count;
            dirty = true;
        }
    }

    return dirty;
}

function rebuild_spline() {
    const cps = spline.cps;
    const n_cps = cps.length;

    // buffer: [P...]
    // buffer: [PtQ...]

    // XXX maybe only on increase?
    const divs = 8;
    const stride = 8;
    const n_verts = divs * n_cps;
    const data = new Float32Array(stride * n_verts);

    {
        // build catrom spline
        let dp = 0;
        const out = data;
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
                //out[dp + 3] = total_arc_length;

                dp += stride;
            }
        }
    }

    {
        const T0 = vec3.create();
        const Q0 = quat.create();
        const T = vec3.create();
        const Q = quat.create();

        // create quaternion frames
        for (let i = 0; i < n_verts; ++i) {
            const dp = stride * i;

            if (i < n_verts-1) {
                const dp2 = stride + dp;

                // tangent for this segment
                T[0] = data[dp2 + 0] - data[dp + 0];
                T[1] = data[dp2 + 1] - data[dp + 1];
                T[2] = data[dp2 + 2] - data[dp + 2];
                vec3.normalize(T, T);

                if (i === 0) {
                    vec3.copy(T0, T);
                    quat.rotationTo(Q, [0,0,1], T);
                    quat.copy(Q0, Q);
                } else {
                    // compare to previous
                    const dot = vec3.dot(T0, T);
                    if (dot < 0.999999) {
                        vec3.cross(Q, T0, T);
                        Q[3] = 1 + dot;
                        quat.normalize(Q, Q);
                        quat.multiply(Q, Q, Q0);
                        if (quat.dot(Q0, Q) < 0)
                            quat.scale(Q, Q, -1);
                    }
                }
            }

            data[dp + 4] = Q[0];
            data[dp + 5] = Q[1];
            data[dp + 6] = Q[2];
            data[dp + 7] = Q[3];
            //console.log(Q);
        }
    }

    {
        gl.bindBuffer(gl.ARRAY_BUFFER, spline.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        spline.n_verts = n_verts;
    }
}

function update_spline() {
    if (update_spline_cps())
        rebuild_spline();
}

function reinitialize_spline() {
    const P = persp.pos;
    spline.cps = [P[0], P[1], P[2] + 200];
    update_spline();
}

// for color
const vcol = vec4.fromValues(0,0,0,1);

function draw_spline() {
    if (!spline.n_verts)
        return;

    const pgm = spline_program.use();
    const ext = gl_ext.instanced;

    pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
    pgm.uniformMatrix4fv('u_view', persp.view);
    {
        vec3.scale(vcol, params.guide_color_0, 1/255);
        pgm.uniform4fv('u_color0', vcol);

        vec3.scale(vcol, params.guide_color_1, 1/255);
        pgm.uniform4fv('u_color1', vcol);
    }
    pgm.uniform2fv('u_fogrange', get_fog_range());
    pgm.uniform2f('u_scale', aerial ? 1 : 0.05, 3.0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // non-instanced attrib
    gl.bindBuffer(gl.ARRAY_BUFFER, spline.shape);
    pgm.vertexAttribPointer('a_position', 3, gl.FLOAT, false, 0, 0);

    // instanced attribs
    gl.bindBuffer(gl.ARRAY_BUFFER, spline.buffer);

    const attr_P = pgm.enableVertexAttribArray('a_P');
    ext.vertexAttribDivisorANGLE(attr_P, 1);
    gl.vertexAttribPointer(attr_P, 3, gl.FLOAT, false, 32, 0);

    const attr_Q = pgm.enableVertexAttribArray('a_Q');
    ext.vertexAttribDivisorANGLE(attr_Q, 1);
    gl.vertexAttribPointer(attr_Q, 4, gl.FLOAT, false, 32, 16);

    ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, spline.n_shape_verts, spline.n_verts);

    // reset divisors
    ext.vertexAttribDivisorANGLE(attr_P, 0);
    ext.vertexAttribDivisorANGLE(attr_Q, 0);

    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
}

const proj_inv = mat4.create();
const view_inv = mat3.create();
let sky_rotate = 0.310;

function draw_sky() {
    const pgm = sky_program.use();

    {
        // http://marcinignac.com/blog/pragmatic-pbr-hdr/
        // https://www.saschawillems.de/?page_id=2122
        // https://rauwendaal.net/2014/06/14/rendering-a-screen-covering-triangle-in-opengl/
        const v = persp.view;
        const b = view_inv;
        b[0] = v[0]; b[1] = v[4]; b[2] = v[8];
        b[3] = v[1]; b[4] = v[5]; b[5] = v[9];
        b[6] = v[2]; b[7] = v[6]; b[8] = v[10];
        mat4.invert(proj_inv, persp.proj);
    }

    pgm.uniformMatrix4fv('u_proj_inv', proj_inv);
    pgm.uniformMatrix3fv('u_view_inv', view_inv);

    pgm.uniformSampler2D('u_texture0', sky_textures[0]);
    pgm.uniformSampler2D('u_texture1', sky_textures[1]);
    pgm.uniform2f('u_resolution', canvas.width, canvas.height);
    pgm.uniform1f('u_rotate', sky_rotate);
    pgm.uniform1f('u_crossfade', params.sky_blend);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf_fstri);
    pgm.vertexAttribPointer('a_position', 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

const V = vec3.create();
const Q = quat.create();
const closest_spline_pos = vec3.create();
let distance_from_closest_spline_pos = 0;
let guide_position = 0;

function update_player() {
    // gravity
    if (1) {
        //vec3.set(V, 0, 0.3, -1);
        vec3.set(V, 0, 0, -1);
        vec3.transformQuat(V, V, persp.rot);
        const S = 0.05 * speed;
        vec3.scaleAndAdd(persp.pos, persp.pos, V, S);
        //persp.pos[1] -= 0.3 * S;
    }

    {
        const P = persp.pos;
        sample_cps(closest_spline_pos, spline.cps, P[2]);
        distance_from_closest_spline_pos = vec3.dist(P, closest_spline_pos);
        //console.log(vec3.str(closest_spline_pos), distance_from_closest_spline_pos);

        // position along guide
        guide_position = sample_cps_position(spline.cps, P[2]) + spline.cp_start;
    }

    // shake
    {
        const P = persp.pos;
        //shake.pos[1] = shake.noise.noise2D(P[1], P[2]);
        vec3.set(shake.pos, 0,0,0);
        const freq = 0.1;
        const amp = shake.amount;

        shake.pos[1] = amp * shake.noise(freq*P[1], freq*P[2]);

        quat.identity(shake.rot);
        quat.rotateZ(shake.rot, shake.rot,
            amp * 0.03 * shake.noise(0.293*freq*P[1], 0.8129*freq*P[2]));
        quat.rotateX(shake.rot, shake.rot,
            amp * 0.01 * shake.noise(0.738*freq*P[1], 0.392*freq*P[2]));
    }

    // AUTOPILOT 2
    if (1) {
        const P = persp.pos;

        // target point
        sample_cps(V, spline.cps, P[2] - 20);

        vec3.sub(V, V, P);
        vec3.normalize(V, V);
        quat.rotationTo(Q, [0,0,-1], V);

        const u = 0.5;
        quat.lerp(rot_target, rot_target, Q, u);
        quat.normalize(rot_target, rot_target);
    }

    // AUTOPILOT 1
    if (0) {
        const P = persp.pos;
        const cps = spline.cps;

        if (cps.length >= (3*5)) {
            // get average point
            vec3.set(V, 0, 0, 0);
            let count = 0;
            for (let i = 2; i < 5; ++i) {
                const sp = 3*i;
                V[0] += cps[sp + 0];
                V[1] += cps[sp + 1];
                V[2] += cps[sp + 2];
                ++count;
            }
            vec3.scale(V, V, 1/count);

            vec3.sub(V, V, P);
            //console.log(vec3.str(V));
            vec3.normalize(V, V);
            quat.rotationTo(Q, [0,0,-1], V);

            {
                let d = (distance_from_closest_spline_pos - 3) / 10;
                if (d > 0) {
                    shake.amount = lerp(shake.amount, d, 0.1);
                } else {
                    shake.amount *= 0.5;
                    if (shake.amount < 0.01)
                        shake.amount = 0;
                }
            }

            if (autopilot_enabled) {
                shake.amount *= 0.5;
            }

            //const u = clamp(distance_from_closest_spline_pos/30, 0, 1);
            //const u = 0.5;
            if (autopilot_enabled ||
                (distance_from_closest_spline_pos > 10)) {

                if (distance_from_closest_spline_pos > 15) {
                    const now = performance.now();
                    if (now > next_bing_time) {
                        sounds.bing.play();
                        next_bing_time = now + bing_interval;
                    }
                }

                const u = clamp(
                    (distance_from_closest_spline_pos - 10) / 20,
                    0, 1);
                if (u > 0) {
                    //console.log(Q);
                    quat.lerp(rot_target, rot_target, Q, u);
                    quat.normalize(rot_target, rot_target);
                    autopilot_enabled = true;
                }
            } else {
                shake.amount *= 0.8;
            }
        }
    }

    if (debug_enabled) {
        debug(`lat: ${persp.pos[0].toFixed(3)}  alt: ${persp.pos[1].toFixed(3)}  speed: ${speed.toFixed(3)}  error: ${distance_from_closest_spline_pos.toFixed(3)}  ${autopilot_enabled ? '[autopilot]' : ''}  shake: ${shake.amount.toFixed(3)} sky: ${sky_rotate.toFixed(3)} fov: ${persp.fov}  travel: ${guide_position.toFixed(3)}`);
    }

    if (aerial)
        quat.identity(rot_target);

    quat.lerp(persp.rot, persp.rot, rot_target, 0.01);
    quat.normalize(persp.rot, persp.rot);
}

const anims = {
    sky_blend: new FCurve,
    fade: new FCurve,
};

{
    // init animation curves
    anims.sky_blend
        .set_key(5.5, 0)
        .set_key(6.0, 1)
        .set_key(8.5, 1)
        .set_key(11.0, 0);

    anims.fade
        .set_key(14, 0)
        .set_key(15, 1);
}

function update_animation() {
    const time = guide_position;
    params.sky_blend = anims.sky_blend.evaluate(time);
    params.sun_strength = lerp(1.5, 0.4, params.sky_blend);
    params.ambient_shading = lerp(0.53, 1.0, params.sky_blend);
    //params.sky_blend = (Math.sin(5*time) + 1) / 2;
    params.fade = anims.fade.evaluate(time);
}

function animate() {
    requestAnimationFrame(animate);

    update_player();
    update_persp();
    update_spline();
    update_animation();
    if (clouds_enabled)
        update_clouds(persp, false);
    if (trails_enabled)
        trails.update(persp, spline.cps);
    draw();
}

animate();

const gui = (function() {
    if (!developer_enabled)
        return null;

    const gui = new dat.GUI();

    gui.add(params, 'fade', 0, 1).listen();
    gui.add(params, 'sky_blend', 0, 1).listen();

    gui.addColor(params, 'sun_color');
    gui.add(params, 'sun_strength', 0, 5);
    gui.add(params, 'ambient_shading', 0, 1);

    gui.add(params, 'cloud_scale', 0, 5);
    gui.add(params, 'cloud_rotate', 0, 1);

    gui.addColor(params, 'guide_color_0');
    gui.addColor(params, 'guide_color_1');
    gui.add(params, 'guide_ymin', 0, 100);
    gui.add(params, 'guide_ymax', 0, 100);
    gui.add(params, 'guide_wander', 0, 10);
    gui.add(params, 'guide_advance', 10, 100);
    gui.add(params, 'guide_rebuild');

    gui.addColor(params, 'trail_color_0').onChange(update_trails_palette);
    gui.addColor(params, 'trail_color_1').onChange(update_trails_palette);
    gui.add(params, 'trail_blend', ['normal', 'add']);
    gui.add(params, 'trail_width', 0, 3);
    gui.add(params, 'trail_amount', 0, 1024);
}());

document.onmousemove = e => {
    if (!mouse_enabled) {
        return;
    }

    const mx = 2*(e.offsetX / canvas.width) - 1;
    const my = 2*(e.offsetY / canvas.height) - 1;

    quat.identity(rot_target);
    quat.rotateZ(rot_target, rot_target, -mx * 60 * DEG2RAD);
    quat.rotateX(rot_target, rot_target, -my * 30 * DEG2RAD);

    autopilot_enabled = false;
};

document.onkeydown = e => {
    if (e.code == 'KeyC') {
        toggle_cockpit();
        e.preventDefault();
    }

    if (e.code == 'KeyV') {
        clouds_enabled = !clouds_enabled;
        e.preventDefault();
    }

    if (e.code == 'KeyD') {
        debug_enabled = !debug_enabled;
        if (!debug_enabled)
            debug();
        e.preventDefault();
    }

    if (e.code == 'KeyT') {
        trails_enabled = !trails_enabled;
        e.preventDefault();
    }

    if (!developer_enabled)
        return;

    if (e.code == 'KeyS') {
        reinitialize_spline();
        e.preventDefault();
    }

    if (e.code == 'ArrowLeft') {
        sky_rotate -= 0.01;
        e.preventDefault();
    }

    if (e.code == 'ArrowRight') {
        sky_rotate += 0.01;
        e.preventDefault();
    }

    if (e.code == 'BracketLeft') {
        persp.fov -= 1;
        e.preventDefault();
    }

    if (e.code == 'BracketRight') {
        persp.fov += 1;
        e.preventDefault();
    }

    if (e.code == 'KeyM') {
        mouse_enabled = !mouse_enabled;
        e.preventDefault();
    }

    if (e.code == 'KeyA') {
        aerial = !aerial;
        debug(aerial ? 'aerial' : 'persp');
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

    if (e.code == 'KeyQ') {
        autopilot_enabled = !autopilot_enabled;
        e.preventDefault();
    }
};

document.addEventListener('mousewheel', e => {
    const dy = -e.deltaY/53;
    speed = clamp(speed * (1 + 0.1*dy), 1, 50);
    //e.preventDefault();
}, {passive: true});

window.addEventListener('deviceorientation', function(e) {
    if (!(e.beta && e.gamma)) {
        // no IMU
        return;
    }

    const ori = get_orientation();
    if (ori !== 0) {
        // wrong orientation
        autopilot_enabled = true;
        return;
    }

    autopilot_enabled = false;
    //debug(`o=${ori}  α=${format_angle(e.alpha)}  β=${format_angle(e.beta)}  γ=${format_angle(e.gamma)}`);

    quat.identity(rot_target);

    /*
    // landscape version
    const g = e.gamma;
    let rx = 0;
    let rz = 0;
    if (0 <= g & g < 90) {
        rx = -(90 - g);
        rz = e.beta;
    }
    else if (-90 <= g && g < 0) {
        rx = -(-90 - g);
        if (e.beta < 0)
            rz = -180-e.beta;
        else
            rz = 180-e.beta;
    }
    //rx += 10;
    */

    // portrait-primary
    const rz = -e.gamma;
    const rx = e.beta - 60;

    const kz = 1;
    const kx = 0.1;

    //debug(`o=${ori}  β=${format_angle(e.beta)}  γ=${format_angle(e.gamma)}  roll=${format_angle(rz)}  pitch=${format_angle(rx)}`);

    quat.rotateZ(rot_target, rot_target, kz * rz * DEG2RAD);
    quat.rotateX(rot_target, rot_target, kx * rx * DEG2RAD);
});

function get_orientation() {
    if (window.screen &&
        window.screen.orientation &&
        window.screen.orientation.angle !== undefined &&
        window.screen.orientation.angle !== null)
    {
        return window.screen.orientation.angle;
    }

    return window.orientation || 0;
}

canvas.addEventListener('touchstart', e => {
    toggle_cockpit();
}, {passive: true});

function show_cockpit(show) {
    $('.cockpit').style.display = show ? 'block' : 'none';
}

function toggle_cockpit() {
    show_cockpit(cockpit_visible = !cockpit_visible);
}

function Noise(scale=1, octaves=1) {
    const simplex = new SimplexNoise();

    let max_v = 0;
    {
        let amp = 1.0;
        for (let oc = 0; oc < octaves; ++oc) {
            max_v += amp;
            amp *= 0.5;
        }
    }

    return function(x, y) {
        let v = 0.0;
        let amp = 1.0;
        let scl = scale;
        for (let oc = 0; oc < octaves; ++oc) {
            v += amp * simplex.noise2D(scl*x, scl*y);
            amp *= 0.5;
            scl *= 2.0;
        }
        v /= max_v;
        return v;
    };
}

function format_angle(x) {
    const s = (x < 0) ? '-' : '+';
    const n = (x < 0) ? ~~(-x) : ~~x;
    return s + (''+n).padStart(3, 0);
}
