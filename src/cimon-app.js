import './reloader';
import {mat3, mat4, vec2, vec3, vec4, quat} from 'gl-matrix';
import {assert, lerp, clamp, random_gaussian, DEG2RAD, resize_canvas_to_client_size, redraw_func, $} from './utils';
import {create_gl, create_buffer, create_program, create_texture, GLSL} from './webgl';
import {Camera} from './camera';
import {Orbit} from './orbit';
import {make_mouse_control} from './mouse-control';
import {init_cimon} from './cimon';
import {init_cupola} from './cupola';
import {PickRay} from './pick-ray';
import {assets} from './cimon-common.js';

export function init_cimon_app(opts) {
    let canvas = opts.canvas;

    if (typeof canvas == 'string')
        canvas = document.querySelector(canvas);

    if (opts.assetsPath)
        assets.set_base(opts.assetsPath);

    assert(canvas instanceof HTMLCanvasElement);

    let gl = create_gl(canvas);
    const gl_ext = {
        aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
        instanced: gl.getExtension('ANGLE_instanced_arrays'),
    };

    let grid_enabled = false;
    let wireframe = false;
    let developer_enabled = false;
    let kill_callback = null;

    const orbit = new Orbit;
    const camera = new Camera;
    //const control = make_mouse_control(canvas, orbit, camera);
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
        orbit.distance = 2.8;

        // update camera before loop to avoid NaNs in pickray
        update_camera();
    }

    const debug = (function() {
        const el = $('.debug');
        return s => {
            el.innerHTML = s;
        };
    }());

    let cimon = init_cimon(gl_ext, opts.onEnd);
    const cupola = init_cupola();

    function draw() {
        resize_canvas_to_client_size(canvas, true);

        const cw = canvas.width;
        const ch = canvas.height;
        gl.viewport(0, 0, cw, ch);

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        cupola.draw(env);
        cimon.draw(env);
    }

    function update_camera() {
        camera.viewport[2] = canvas.width;
        camera.viewport[3] = canvas.height;

        orbit.update();
        orbit.get_view(camera.view);

        tilt.update();
        tilt.apply(camera.view);

        camera.update();
    }

    function update(time) {
        env.dt = time - env.time;
        env.time = time;

        update_camera();
        cupola.update(env);
        cimon.update(env);
    }

    let start_time = -1;
    let animating = false;

    function animate(now) {
        if (kill_callback) {
            kill_callback();
            animating = false;
            return;
        }

        animating = true;

        let time = 0;
        if (now) {
            if (start_time < 0)
                start_time = now;
            time = now - start_time;
        }

        requestAnimationFrame(animate);
        update(time);
        draw();
    }

    function play() {
        if (start_time < 0) {
            animate();
            setTimeout(function() { cimon.start_speech(env) }, 3000);
        }
    }

    function replay() {
        cimon.start_speech(env);
    }

    /*
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
    */

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

    function maybe_poke_cimon(e) {
        get_window_coords(wc, e);
        env.pickray.fromWindowCoords(wc[0], wc[1]);
        cimon.set_interest(env);
        if (cimon.hit_test(env))  {
            const f = lerp(0.5, 2, Math.random());
            cimon.add_force([0, 0, -f]);
            //cimon.start_speech(env);
        }
    }

    function on_mousemove(e) {
        get_window_coords(wc, e);
        env.pickray.fromWindowCoords(wc[0], wc[1]);
        cimon.set_interest(env);
    }

    function on_mousedown(e) {
        maybe_poke_cimon(e);
    }

    function on_touchstart(e) {
        maybe_poke_cimon(e);
        //e.preventDefault();
    }

    function on_touchmove(e) {
        get_window_coords(wc, e);
        env.pickray.fromWindowCoords(wc[0], wc[1]);
        cimon.set_interest(env);
        //e.preventDefault();
    }

    function on_devicemotion(e) {
        const acc = e.acceleration;
        const a = vec3.fromValues(acc.y, -acc.x, acc.z);
        //debug(`accel: ${vec3.str(a)}`);

        const pos_target = tilt.pos_target;
        const k = 0.005;
        //vec3.scaleAndAdd(pos_target, pos_target, a, k);
    }

    function on_deviceorientation(e) {
        const ori = get_orientation();
        if (!(e.beta && e.gamma)) {
            // no IMU
            return;
        }
        //debug(`ori: ${ori}  beta: ${e.beta.toFixed(3)}  gamma: ${e.gamma.toFixed(3)}`);

        const rot_target = tilt.rot_target;
        quat.identity(rot_target);

        let rx = 0;
        let rz = 0;

        if (ori === -90) {
            const g = e.gamma;
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
        }
        else if (ori === 0) {
            const b = e.beta;
            rx = -(e.beta - 90);
            if (b < 90) {
                rz = e.gamma;
            } else {
                rz = -e.gamma;
            }
        }

        //rx += 10;

        if (rx || rz) {
            quat.rotateZ(rot_target, rot_target, 0.25*rz * DEG2RAD);
            quat.rotateX(rot_target, rot_target, 0.125*rx * DEG2RAD);
        }
    }

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

    function add_events() {
        document.addEventListener('mousemove', on_mousemove);
        document.addEventListener('mousedown', on_mousedown);
        canvas.addEventListener('touchstart', on_touchstart, {passive:false});
        canvas.addEventListener('touchmove', on_touchmove, {passive:false});
        window.addEventListener('devicemotion', on_devicemotion);
        window.addEventListener('deviceorientation', on_deviceorientation);
    }

    function remove_events() {
        document.removeEventListener('mousemove', on_mousemove);
        document.removeEventListener('mousedown', on_mousedown);
        canvas.removeEventListener('touchstart', on_touchstart, {passive:false});
        canvas.removeEventListener('touchmove', on_touchmove, {passive:false});
        window.removeEventListener('devicemotion', on_devicemotion);
        window.removeEventListener('deviceorientation', on_deviceorientation);
    }

    add_events();

    function cleanup() {
        console.log('RI_Cimon: cleanup');
        cimon.kill();
        cimon = null;

        remove_events();
        // webgl cleanup: TODO
        gl = null;
        window.gl = null;
    }

    function kill() {
        console.log('RI_Cimon: kill');
        if (animating) {
            if (!kill_callback)
                kill_callback = cleanup;
        } else {
            cleanup();
        }
    }

    return {kill, play, replay};
}
