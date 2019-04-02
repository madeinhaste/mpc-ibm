import {lerp} from './utils';
import {vec3} from 'gl-matrix';

export function sample_cps(out, cps, zc) {
    if (!cps.length) {
        vec3.set(out, 0, 0, 0);
        return;
    }

    let i;
    for (i = 0; i < cps.length; i += 3) {
        const z = cps[i + 2];
        if (z < zc)
            break;
    }

    if (i === 0) {
        vec3.copy(out, cps);
        return;
    }

    if (i === cps.length) {
        out[0] = cps[i - 3];
        out[1] = cps[i - 2];
        out[2] = cps[i - 1];
        return;
    }

    const z0 = cps[i - 1];
    const z1 = cps[i + 2];
    const u = (zc - z0) / (z1 - z0);

    out[0] = lerp(cps[i - 3], cps[i + 0], u);
    out[1] = lerp(cps[i - 2], cps[i + 1], u);
    out[2] = lerp(cps[i - 1], cps[i + 2], u);
}

// find the fractional index along cps
export function sample_cps_position(cps, zc) {
    if (!cps.length) {
        return 0;
    }

    let i;
    for (i = 0; i < cps.length; i += 3) {
        const z = cps[i + 2];
        if (z < zc)
            break;
    }

    if (i === 0) {
        return 0;
    }

    if (i === cps.length) {
        return i/3;
    }

    const z0 = cps[i - 1];
    const z1 = cps[i + 2];
    const u = (zc - z0) / (z1 - z0);
    return ((i/3)-1) + u;
}

export function fade_and_stop_sounds(sounds) {
    // one second
    const d = 1000;
    // filter nulls
    sounds = sounds.filter(s => !!s);
    // fade volume to zero
    sounds.forEach(s => s.fade(s.volume(), 0, d));
    // stop
    setTimeout(function() { sounds.forEach(s => s.stop()) }, d);
}
