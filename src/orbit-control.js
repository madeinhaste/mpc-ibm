const DOLLY_SCALE = 0.2;
const TUMBLE_SCALE = -0.0010;
const PAN_SCALE = 1 * DOLLY_SCALE;

export function orbit_mouse_control(orbit, mouse) {
    mouse.ondragmove = function(e) {
        if (mouse.button === 0) {
            if (e.ctrlKey)  {
                var dx = mouse.delta[0];
                var dy = mouse.delta[1];
                var d = (Math.abs(dx) > Math.abs(dy)) ? dx : -dy;
                orbit.dolly(d * DOLLY_SCALE);
            } else if (e.shiftKey) {
                orbit.pan(-PAN_SCALE * mouse.delta[0], PAN_SCALE * mouse.delta[1]);
            } else {
                orbit.tumble(TUMBLE_SCALE * mouse.delta[0], TUMBLE_SCALE * mouse.delta[1]);
            }
        }

        if (mouse.button === 1) {
            orbit.pan(-PAN_SCALE * mouse.delta[0], PAN_SCALE * mouse.delta[1]);
        }

        if (mouse.button === 2) {
            var dx = mouse.delta[0];
            var dy = mouse.delta[1];
            var d = (Math.abs(dx) > Math.abs(dy)) ? -dx : dy;
            orbit.dolly(2 * DOLLY_SCALE * d);
        }
    };
}
