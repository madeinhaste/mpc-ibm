import {vec3, quat} from 'gl-matrix';
import {closest_points_between_rays, ray_plane_intersect} from './geom-utils';
import {PickRay} from './pick-ray';

/*
 * canvas: install mouse events, use height to convert mouse event to window coords
 * orbit: dolly, tumble, pan
 * camera: view, ortho
 * target: position, rotation
 */

const debug = {
    show() {},
};

export function make_mouse_control(canvas, orbit, camera) {
    let target = null;

    let tool_mode = null;
    let target_position_start = vec3.create();
    let target_rotation_start = quat.create();
    let marker_start = vec3.create();
    let marker_curr = vec3.create();
    let marker_constrain = null;

    let ray = new PickRay(camera);

    function set_target(t) {
        target = t;
    }

    function set_constrain_axis(axis) {
        if (axis === 0) {
            // no axis : constrain view plane

            let plane_o = vec3.clone(target.position);
            let vm = camera.view;
            let plane_n = vec3.fromValues(vm[2], vm[6], vm[10]);

            marker_constrain = function(out, ro, rd) {
                return ray_plane_intersect(out, ro, rd, plane_o, plane_n);
            };

            marker_constrain(marker_start, ray.origin, ray.direction);

            debug.show({axis: 'view XY'});
            return;
        }

        if (tool_mode == 'rotate') {
            // constrain to plane only
            axis = -Math.abs(axis);
        }

        if (axis > 0) {
            let line_o = vec3.clone(target.position);
            let line_d = vec3.create();
            line_d[axis-1] = 1;

            marker_constrain = function(out, ro, rd) {
                return closest_points_between_rays(null, out, ro, rd, line_o, line_d);
            };

            marker_constrain(marker_start, ray.origin, ray.direction);

            debug.show({axis: 'world ' + ('XYZ').substr(axis-1, 1)});
            return;
        }

        if (axis < 0) {
            // planar
            let plane_o = vec3.clone(target.position);
            let plane_n = vec3.create();
            plane_n[(-axis)-1] = 1;

            marker_constrain = function(out, ro, rd) {
                return ray_plane_intersect(out, ro, rd, plane_o, plane_n);
            };

            marker_constrain(marker_start, ray.origin, ray.direction);

            debug.show({axis: 'world ~' + ('XYZ').substr((-axis)-1, 1)});
            return;
        }
    }

    function enter_tool_move() {
        if (!target)
            return;

        set_tool_mode('move');
        set_constrain_axis(0);

        // constrain start point
        marker_constrain(marker_start, ray.origin, ray.direction);
        vec3.copy(target_position_start, target.position);
    }

    function enter_tool_rotate() {
        if (!target)
            return;

        if (tool_mode == 'rotate') {
            set_tool_mode('rotate2');
            set_constrain_axis(0);  // project to view plane
            marker_constrain(marker_start, ray.origin, ray.direction);
            quat.copy(target_rotation_start, target.rotation);
            return;
        }

        set_tool_mode('rotate');
        set_constrain_axis(0);

        // constrain start point
        marker_constrain(marker_start, ray.origin, ray.direction);
        quat.copy(target_rotation_start, target.rotation);
    }

    function set_constrain_axis_key(e) {
        if (tool_mode !== 'move' && tool_mode !== 'rotate')
            return;

        let axis = 'xyz'.indexOf(e.key) + 1;
        console.assert(0 < axis && axis <= 3);

        if (e.shiftKey)
            axis = -axis;

        set_constrain_axis(axis);
    }

    const hotkeys = {
        Numpad5() { camera.ortho = !camera.ortho },

        KeyG: enter_tool_move,
        KeyR: enter_tool_rotate,

        KeyX: set_constrain_axis_key,
        KeyY: set_constrain_axis_key,
        KeyZ: set_constrain_axis_key,
    };

    function exec_hotkey(e) {
        let func = hotkeys[e.code];
        if (func) {
            func(e);
            e.preventDefault();
        } else {
            console.log('unmapped keydown:', e.code);
        }
    }

    document.addEventListener('keydown', exec_hotkey);

    function set_tool_mode(mode) {
        if (mode == tool_mode)
            return;

        tool_mode = mode;
        debug.show({mode});

        if (mode == 'move') {
            // start move
        }

        if (!mode) {
            debug.show({axis: null});
        }
    }

    debug.show({mode: null});


    let get_orbit_func = (function() {
        //const DOLLY_SCALE = 0.0050;
        //const TUMBLE_SCALE = -0.0010;
        //const PAN_SCALE = 1 * DOLLY_SCALE;

        const DOLLY_SCALE = 0.05;
        const TUMBLE_SCALE = -0.0010;
        const PAN_SCALE = 0.125 * DOLLY_SCALE;

        function orbit_dolly(delta) {
            const dx = delta[0];
            const dy = delta[1];
            const d = (Math.abs(dx) > Math.abs(dy)) ? -dx : dy;
            orbit.dolly(DOLLY_SCALE * d);
        }

        function orbit_tumble(delta) {
            orbit.tumble(TUMBLE_SCALE * delta[0], TUMBLE_SCALE * delta[1]);
        }

        function orbit_pan(delta) {
            orbit.pan(-PAN_SCALE * delta[0], PAN_SCALE * delta[1]);
        }

        return function get_orbit_func(e) {
            if (e.button == 1)
                return orbit_pan;

            if (e.button == 2)
                return orbit_dolly;

            if (e.shiftKey)
                return orbit_pan;

            if (e.ctrlKey)
                return orbit_dolly;

            return orbit_tumble;
        }
    }());

    // mouse stuff
    {
        function update_pick_ray(e) {
            let mx = e.offsetX;
            let my = canvas.height - e.offsetY - 1;
            ray.fromWindowCoords(mx, my);
        }

        // disable context menu
        canvas.oncontextmenu = e => e.preventDefault();

        let dragging = false;
        let orbit_func;

        canvas.onmousedown = e => {
            update_pick_ray(e);
            dragging = true;
            orbit_func = get_orbit_func(e);

            if (tool_mode == 'move') {
                // XXX cancel/exec
                set_tool_mode(null);

                if (e.button === 0) {
                    // confirm
                }
                else if (e.button === 2) {
                    // cancel
                    vec3.copy(target.position, target_position_start);
                }
            }

            if (tool_mode == 'rotate' || tool_mode == 'rotate2') {
                // XXX cancel/exec
                set_tool_mode(null);

                if (e.button === 0) {
                    // confirm
                }
                else if (e.button === 2) {
                    // cancel
                    quat.copy(target.rotation, target_rotation_start);
                }
            }
        };

        document.onmousemove = e => {
            //if (e.target !== canvas) return;
            update_pick_ray(e);

            if (tool_mode == 'move') {
                marker_constrain(marker_curr, ray.origin, ray.direction);

                let delta = vec3.create();
                vec3.sub(delta, marker_curr, marker_start);

                // apply to object
                vec3.add(target.position, target_position_start, delta);
            }

            if (tool_mode == 'rotate') {
                marker_constrain(marker_curr, ray.origin, ray.direction);

                let v0 = vec3.create();
                let v1 = vec3.create();
                vec3.sub(v0, marker_start, target.position);
                vec3.normalize(v0, v0);

                let qinv = quat.clone(target_rotation_start);
                quat.invert(qinv, qinv);

                vec3.transformQuat(v0, v0, qinv);

                vec3.sub(v1, marker_curr, target.position);
                vec3.normalize(v1, v1);
                vec3.transformQuat(v1, v1, qinv);

                let q = quat.create();
                quat.rotationTo(q, v0, v1);

                quat.mul(target.rotation, target_rotation_start, q);
                quat.normalize(target.rotation, target.rotation);
            }

            if (tool_mode == 'rotate2') {
                // project to view plane
                marker_constrain(marker_curr, ray.origin, ray.direction);

                let delta = vec3.create();
                vec3.sub(delta, marker_curr, marker_start);

                let angle = 0.01 * vec3.length(delta);

                let axis = vec3.create();
                let vm = camera.view;
                let vdir = [ vm[2], vm[6], vm[10] ]; // camera forward
                vec3.normalize(delta, delta);
                vec3.normalize(vdir, vdir);
                vec3.cross(axis, vdir, delta);

                let qinv = quat.clone(target_rotation_start);
                quat.invert(qinv, qinv);
                vec3.transformQuat(axis, axis, qinv);

                let q = quat.create();
                quat.setAxisAngle(q, axis, angle);

                quat.mul(target.rotation, target_rotation_start, q);
                quat.normalize(target.rotation, target.rotation);
            }

            if (dragging) {
                // camera manipulator
                let delta = [e.movementX, e.movementY];
                orbit_func(delta);
            }
        };

        document.onmouseup = e => {
            //if (e.target !== canvas) return;

            update_pick_ray(e);
            dragging = false;
        };

    }

    return {set_target};
}
