export function init_rotation_sensor() {
    // device orientation values
    const euler = { alpha:0, beta:0, gamma:0 };

    // median filter
    const n_samples = 10;
    const samples = new Uint8Array(n_samples);
    let sample_idx = 0;

    function get_both(filtered) {
        // orientation remap
        let o = get_orientation()/90;
        if (o == -1) o = 1;
        else if (o == 1) o = 3;

        let r;

        if (filtered) {
            const counts = [0, 0, 0, 0];
            let max_idx = -1;
            let max_count = -1;
            for (let i = 0; i < n_samples; ++i) {
                const s = samples[i];
                const count = ++counts[s];
                if (count > max_count) {
                    max_idx = s;
                    max_count = count;
                }
            }
            r = max_idx;
        }
        else {
            // rotation
            r = 0;
            if (euler.gamma > 45)
                r = 1;
            else if (euler.gamma < -45)
                r = 3;
            else
                r = 0;

            if (euler.beta < -45) {
                if (r == 0)
                    r = 2;
                else if (r == 3)
                    r = 1;
                else if (r == 1)
                    r = 3;
            }
        }

        return {o, r};
    }

    function update_rotation(e) {
        if (e) {
            euler.alpha = e.alpha || 0;
            euler.beta = e.beta || 0;
            euler.gamma = e.gamma || 0;
        }

        const {o, r} = get_both(false);
        samples[sample_idx] = r;
        sample_idx = (sample_idx + 1) % n_samples;
    }

    window.addEventListener('deviceorientation', function(e) {
        update_rotation(e);
    });

    update_rotation(null);

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

    function get_rotation() {
        let mode = 0;
        if (euler.gamma > 45)
            mode = 3;
        else if (euler.gamma < -45)
            mode = 1;
        else
            mode = 0;

        if (euler.beta < -45) {
            if (mode == 0)
                mode = 2;
            else if (mode == 1)
                mode = 3;
            else if (mode == 3)
                mode = 1;
        }

        let o = get_orientation()/90;
        o = (4 - o) % 4;
        mode = (mode + o) % 4;

        return mode;
    }

    function sample() {
        const {o, r} = get_both(true);
        return {orientation: o, rotation: r};
    }

    return {sample};
}
