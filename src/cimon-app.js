import './reloader';
import {mat3, mat4, vec2, vec3, vec4, quat} from 'gl-matrix';
import {assert, lerp, clamp, random_gaussian, DEG2RAD, resize_canvas_to_client_size, redraw_func, $} from './utils';
import {create_gl, create_buffer, create_program, create_texture, GLSL} from './webgl';
import {Howl, Howler} from 'howler';

import {Camera} from './camera';
import {Orbit} from './orbit';
import {make_mouse_control} from './mouse-control';
import {init_cimon} from './cimon';
import {init_cupola} from './cupola';
import {init_grid} from './grid';
import {PickRay} from './pick-ray';

const canvas = $('canvas');
const gl = create_gl(canvas);
const gl_ext = {
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
    instanced: gl.getExtension('ANGLE_instanced_arrays'),
};

let grid_enabled = true;
let wireframe = false;
let developer_enabled = true;

const orbit = new Orbit;
const camera = new Camera;
const control = make_mouse_control(canvas, orbit, camera);
const mat = mat4.create();

const tilt = {
    pos: vec3.create(),
    rot: quat.create(),

    pos_target: vec3.create(),
    rot_target: quat.create(),

    update() {
        quat.lerp(this.rot, this.rot, this.rot_target, 0.1);
        quat.normalize(this.rot, this.rot);

        quat.lerp(this.pos, this.pos, this.pos_target, 0.1);
        quat.scale(this.pos_target, this.pos_target, 0.9);
    },

    apply(out) {
        mat4.fromRotationTranslation(mat, this.rot, this.pos);
        mat4.mul(out, out, mat);

        //mat4.invert(persp.view, persp.view);
    },
};

const env = {
    time: 0,
    dt: 0,
    camera: camera,
    pickray: new PickRay(camera),

    light: {
        pos: vec3.fromValues(300, 30, 100),
    },
};

{
    camera.near = 0.1;
    camera.far = 500;
    camera.fov = 30 * DEG2RAD;
    camera.ortho = false;
    camera.ortho_scale = 1.0;

    orbit.rotate[1] = 0 * DEG2RAD;
    //orbit.translate[1] = 5;
    orbit.distance = 1.8;
}

const debug = (function() {
    const el = $('.debug');
    return s => {
        el.innerHTML = s;
    };
}());

const grid = init_grid(gl_ext);
const cimon = init_cimon(gl_ext);
const cupola = init_cupola();

function draw() {
    resize_canvas_to_client_size(canvas, true);

    const cw = canvas.width;
    const ch = canvas.height;
    gl.viewport(0, 0, cw, ch);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (grid_enabled)
        grid.draw(env);

    cupola.draw(env);
    cimon.draw(env);
}

function update(time) {
    env.dt = time - env.time;
    env.time = time;

    camera.viewport[2] = canvas.width;
    camera.viewport[3] = canvas.height;

    orbit.update();
    orbit.get_view(camera.view);

    tilt.update();
    tilt.apply(camera.view);

    camera.update();

    cupola.update(env);
    cimon.update(env);
}

function animate(time) {
    requestAnimationFrame(animate);
    update(time);
    draw();
}

animate(0);

document.addEventListener('keydown', e => {
    if (!developer_enabled)
        return;

    if (e.code == 'KeyW') {
        wireframe = !wireframe;
        e.preventDefault();
    }

    if (e.code == 'KeyG') {
        grid_enabled = !grid_enabled;
        e.preventDefault();
    }

    if (e.code == 'KeyF') {
        const f = lerp(1, 5, Math.random());
        cimon.add_force([
            random_gaussian(0, 5),
            random_gaussian(0, 5),
            -f]
        );
        e.preventDefault();
    }
});

function get_window_coords(out, event) {
    const retina = true;
    let dpr = retina ? window.devicePixelRatio : 1;

    let e = event;
    if (e.touches && e.touches[0])
        e = e.touches[0];

    out[0] = dpr * e.clientX;
    out[1] = canvas.height - (dpr * (e.clientY + 1));
    //debug(`touch: ${vec2.str(out)}`);
}

const wc = vec2.create();

document.addEventListener('mousemove', function(e) {
    get_window_coords(wc, e);
    env.pickray.fromWindowCoords(wc[0], wc[1]);
    cimon.set_interest(env);
    //debug(`${vec3.str(env.pickray.origin)}`);
});

function maybe_poke_cimon(e) {
    get_window_coords(wc, e);
    env.pickray.fromWindowCoords(wc[0], wc[1]);
    cimon.set_interest(env);
    if (cimon.hit_test(env))  {
        const f = lerp(0.5, 2, Math.random());
        cimon.add_force([0, 0, -f]);
        cimon.start_speech(env);
    }
}

document.addEventListener('mousedown', function(e) {
    maybe_poke_cimon(e);
});

canvas.addEventListener('touchstart', function(e) {
    maybe_poke_cimon(e);
    e.preventDefault();
});

canvas.addEventListener('touchmove', function(e) {
    get_window_coords(wc, e);
    env.pickray.fromWindowCoords(wc[0], wc[1]);
    cimon.set_interest(env);
    e.preventDefault();
});

window.addEventListener('devicemotion', function(e) {
    const acc = e.acceleration;
    const a = vec3.fromValues(acc.y, -acc.x, acc.z);
    //debug(`accel: ${vec3.str(a)}`);

    const pos_target = tilt.pos_target;
    const k = 0.005;
    vec3.scaleAndAdd(pos_target, pos_target, a, k);
});

window.addEventListener('deviceorientation', function(e) {
    const ori = get_orientation();
    if (!(e.beta && e.gamma)) {
        // no IMU
        return;
    }
    //debug(`beta: ${e.beta.toFixed(3)}  gamma: ${e.gamma.toFixed(3)}`);

    const rot_target = tilt.rot_target;
    quat.identity(rot_target);

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


    rx += 10;

    quat.rotateZ(rot_target, rot_target, 0.25*rz * DEG2RAD);
    quat.rotateX(rot_target, rot_target, 0.25*rx * DEG2RAD);
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

