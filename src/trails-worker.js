import {vec3, quat} from 'gl-matrix';
import {lerp, random_gaussian, DEG2RAD} from './utils';
import {max_length, vertex_stride} from './trails';
import {sample_cps} from './misc';
import SimplexNoise from 'simplex-noise';
import {ready as sobol_ready} from './sobol';

console.log('hello from trails-worker');

let sobol = null;
sobol_ready.then(SobolSequence => {
    console.log('got sobol sequence');
    sobol = new SobolSequence(2);
    //for (let i = 0; i < 100; ++i) console.log(sobol.nextVector());
});


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
const Q = vec3.create();
const V = vec3.create();
const VV = vec3.create();
const tunnel_radius = 50;
const noise = Noise(0.005, 2);

function generate_trail(idx, cps) {
    {
        // end point
        const sp = cps.length - 3;
        C[0] = cps[sp + 0];
        C[1] = cps[sp + 1];
        C[2] = cps[sp + 2];
    }


    const len = ~~lerp(50, max_length, Math.random());
    //const len = max_length;
    const out = new Float32Array(vertex_stride * len);

    {
        {
            let zc = C[2] + 100 * Math.random();
            sample_cps(C, cps, zc);
            //console.log(idx, zc, vec3.str(C));
            vec3.copy(P, C);

            // push outside tunnel radius
            //const theta = 2 * Math.PI * Math.random();
            //let s = Math.random() < 0.5 ? 0 : Math.PI;
            //const theta = s + random_gaussian(0, 5*DEG2RAD);
            //const theta = Math.random() * 2 * Math.PI;
            //const theta = 0;
            //const r = lerp(tunnel_radius, 1.1*tunnel_radius, Math.random());
            //const r = tunnel_radius;
            let theta, r;

            {
                // sample polar
                let u, v
                if (sobol) {
                    u = Math.random();
                    v = Math.random();
                } else {
                    [u, v] = sobol.nextVector();
                }

                theta = u * 2 * Math.PI;
                r = tunnel_radius * lerp(1, 1.5, v);
            }


            P[0] += r * Math.cos(theta);
            P[1] += r * Math.sin(theta);
        }

            /*
        vec3.copy(P, C);
        P[0] += random_gaussian(0, 50);
        P[1] += random_gaussian(0, 50);
        P[2] += random_gaussian(0, 50);
        */

        vec3.set(VV, 0,0,0);
        let dp = 0;
        for (let j = 0; j < len; ++j) {
            out[dp + 0] = P[0];
            out[dp + 1] = P[1];
            out[dp + 2] = P[2];
            out[dp + 3] = j / (len - 1);
            dp += vertex_stride;

            // advect
            curl(V, P, noise);
            vec3.scale(V, V, 100);
            //vec3.set(V, 0,0,0);
            //V[0] = 0;
            //V[1] = 0;
            //V[2] = 0;

            //V[0] += random_gaussian(0, 3);
            //V[1] += random_gaussian(0, 3);
            //V[2] += random_gaussian(1, 2);

            //V[2] += 1.0;

            {
                // avoid tunnel
                sample_cps(Q, cps, P[2]);
                vec3.sub(Q, P, Q);
                const r2 = tunnel_radius * tunnel_radius;
                const d2 = vec3.dot(Q, Q) / r2;
                if (0 < d2 && d2 < 1) {
                    //const f = 1 - 2*dy + dy*dy;
                    V[0] += 1 * (1-d2) * Q[0];
                    V[1] += 1 * (1-d2) * Q[1];
                }
            }

            vec3.lerp(VV, VV, V, 0.1);
            vec3.add(P, P, VV);
        }

        calculate_frames(out);
    }

    return {
        idx,
        P: out.buffer,
    };
}

function calculate_frames(data) {
    const T0 = vec3.create();
    const Q0 = quat.create();
    const T = vec3.create();
    const Q = quat.create();

    // create quaternion frames
    const n_verts = data.length / vertex_stride;
    for (let i = 0; i < n_verts; ++i) {
        const dp = vertex_stride * i;
        if (i < n_verts-1) {
            const dp2 = vertex_stride + dp;

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

var dPdx = vec3.create();
var dPdy = vec3.create();
var dPdz = vec3.create();

var P0 = vec3.create();
var P1 = vec3.create();

// gradient
function Pot(out, N, x, y, z) {
    out[0] = N(x +  0.0, y +   0.0, z +  0.0);
    out[1] = N(y - .191, z +  .334, x + .472);
    out[2] = N(z + .742, x - .1245, y + .994);
    //let d = Math.min(1, ((x*x + y*y) / 100000));
    //vec3.scale(out, out, d);
}

function dPot(out, N, x, y, z, dx, dy, dz) {
    Pot(P1, N, x+dx, y+dy, z+dz);
    Pot(P0, N, x-dx, y-dy, z-dz);
    vec3.sub(out, P1, P0);
}

function curl(out, pos, N) {
    const x = pos[0];
    const y = pos[1];
    const z = pos[2];

    // sample potential gradient
    const e = 1e-0;
    dPot(dPdx, N, x, y, z, e, 0, 0);
    dPot(dPdy, N, x, y, z, 0, e, 0);
    dPot(dPdz, N, x, y, z, 0, 0, e);

    // calc curl
    out[0] = dPdy[2] - dPdz[1];
    out[1] = dPdz[0] - dPdx[2];
    out[2] = dPdx[1] - dPdy[0];

    vec3.scale(out, out, 0.5/e);
    //vec3.normalize(out, out);
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
