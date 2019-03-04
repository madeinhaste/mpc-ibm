import {vec2, vec3} from 'gl-matrix';
import {lerp, random_gaussian, DEG2RAD} from './utils';
import SimplexNoise from 'simplex-noise';

self.onmessage = e => process(e.data);

function update_bounds(bounds, pos) {
    for (let i = 0; i < 3; ++i) {
        bounds[i + 0] = Math.min(bounds[i + 0], pos[i]);
        bounds[i + 3] = Math.max(bounds[i + 3], pos[i]);
    }
}

function process(req) {
    const N = Noise(0.005, 2);
    const V = vec3.create();
    const P = vec3.create();

    if (req.type == 'P') {
        // sample potential field
        sample_potential_field(req, N);
        return;
    }

    const D0 = vec3.create();
    const D1 = vec3.create();
    const min_dot = Math.cos(DEG2RAD * 2);

    const pos = vec3.clone(req.start);
    const points = new Float32Array(3 * req.count);
    const bounds = [0, 0, 0, 0, 0, 0];
    let dp = 0;
    const dp_end = points.length;

    vec3.set(D0, 1, 0, 0);   // arbitrary first dir
    vec3.copy(P, pos);
    while (dp < dp_end) {
        // add point
        update_bounds(bounds, pos);
        points[dp + 0] = pos[0];
        points[dp + 1] = pos[1];
        points[dp + 2] = pos[2];
        dp += 3;

        // advect
        let iters = 0;
        for (;;) {
            curl(V, N, P[0], P[1], P[2]);
            const speed = 0.1;
            vec3.scaleAndAdd(P, P, V, speed);

            vec3.sub(D1, P, pos);
            vec3.normalize(D1, D1);
            ++iters;

            if (vec3.dot(D0, D1) < min_dot)
                break;

            if (iters > 1000) {
                console.log('iters:', iters);
                break;
            }
        }

        vec3.sub(D0, P, pos);
        vec3.normalize(D0, D0);
        vec3.copy(pos, P);
    }

    /*
    for (let i = 0; i < req.count; ++i) {
        points[dp + 0] = pos[0];
        points[dp + 1] = pos[1];
        points[dp + 2] = pos[2];
        dp += 3;

        update_bounds(bounds, pos);

        curl(V, N, pos[0], pos[1], pos[2]);
        vec3.scaleAndAdd(pos, pos, V, 10);

        //pos[0] += random_gaussian(0, 0.05);
        //pos[1] += random_gaussian(0, 0.05);
        //pos[2] += 5.0;
    }
    */
    
    // post
    const result = {
        points: points.buffer,
        bounds,
    };

    postMessage(result, [points.buffer]);
}

function sample_potential_field(req, N) {
    const n = req.count;
    const points = new Float32Array(6 * n*n*n);
    const bounds = req.bounds;
    const out = vec3.create();
    let dp = 0;
    for (let i = 0; i < n; ++i) {
        const x = lerp(bounds[0], bounds[3], i/(n-1));
        for (let j = 0; j < n; ++j) {
            const y = lerp(bounds[1], bounds[4], j/(n-1));
            for (let k = 0; k < n; ++k) {
                const z = lerp(bounds[2], bounds[5], k/(n-1));
                curl(out, N, x, y, z);

                points[dp + 0] = x;
                points[dp + 1] = y;
                points[dp + 2] = z;

                const scale = 50;
                points[dp + 3] = x + scale*out[0];
                points[dp + 4] = y + scale*out[1];
                points[dp + 5] = z + scale*out[2];

                dp += 6;
            }
        }
    }

    const result = {
        type: 'P',
        points: points.buffer,
        bounds,
    };

    postMessage(result, [points.buffer]);
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

    return function(x, y, z) {
        let v = 0.0;
        let amp = 1.0;
        let scl = scale;
        for (let oc = 0; oc < octaves; ++oc) {
            v += amp * simplex.noise3D(scl*x, scl*y, scl*z);
            amp *= 0.5;
            scl *= 2.0;
        }
        v /= max_v;
        return v;
    };
}

// potential field
function P(out, N, x, y, z) {
    out[0] = N(x +  0.0, y +   0.0, z +  0.0);
    out[1] = N(y - .191, z +  .334, x + .472);
    out[2] = N(z + .742, x - .1245, y + .994);

    let d = Math.min(1, ((x*x + y*y) / 100000));
    vec3.scale(out, out, d);
}

const dPdx = vec3.create();
const dPdy = vec3.create();
const dPdz = vec3.create();

const P0 = vec3.create();
const P1 = vec3.create();

// gradient
function dP(out, N, x, y, z, dx, dy, dz) {
    P(P1, N, x+dx, y+dy, z+dz);
    P(P0, N, x-dx, y-dy, z-dz);
    vec3.sub(out, P1, P0);
}

function curl(out, N, x, y, z) {
    // sample potential gradient
    const e = 0.001;
    dP(dPdx, N, x, y, z, e, 0, 0);
    dP(dPdy, N, x, y, z, 0, e, 0);
    dP(dPdz, N, x, y, z, 0, 0, e);

    // calc curl
    out[0] = dPdy[2] - dPdz[1];
    out[1] = dPdz[0] - dPdx[2];
    out[2] = dPdx[1] - dPdy[0];

    vec3.scale(out, out, 0.5/e);
    //vec3.normalize(out, out);
}
