import {vec3} from 'gl-matrix';
import {lerp, random_gaussian} from './utils';
import {max_length, vertex_stride} from './trails';
import {sample_cps} from './misc';

console.log('hello from trails-worker');

self.onmessage = function(e) {
    const cps = e.data.cps;
    const idxs = e.data.idxs;
    for (let i = 0; i < idxs.length; ++i) {
        const data = generate_trail(idxs[i], cps);
        postMessage(data, [data.P]);
    }
};

const C = vec3.create();
const P = vec3.create();

function generate_trail(idx, cps) {
    {
        // end point
        const sp = cps.length - 3;
        C[0] = cps[sp + 0];
        C[1] = cps[sp + 1];
        C[2] = cps[sp + 2];
    }


    const len = ~~lerp(50, max_length, Math.random());
    const out = new Float32Array(vertex_stride * len);

    {
        vec3.copy(P, C);
        P[0] += random_gaussian(0, 50);
        P[1] += random_gaussian(0, 50);
        P[2] += random_gaussian(0, 50);

        let dp = 0;
        for (let j = 0; j < len; ++j) {
            out[dp + 0] = P[0];
            out[dp + 1] = P[1];
            out[dp + 2] = P[2];
            out[dp + 3] = j / (len - 1);
            dp += 4;

            // advect
            P[0] += random_gaussian(0, 1);
            P[1] += random_gaussian(0, 1);
            P[2] += random_gaussian(1, 2);
        }
    }

    return {
        idx,
        P: out.buffer,
    };
}
