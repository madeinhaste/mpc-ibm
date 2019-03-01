import SimplexNoise from 'simplex-noise';
import {vec2} from 'gl-matrix';
import {lerp, DEG2RAD} from './utils';

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

function gradient(out, x, y, noise) {
    const e = 0.01;
    const dx = noise(x+e, y) - noise(x-e, y);
    const dy = noise(x, y+e) - noise(x, y-e);
    out[0] = -dy;
    out[1] = dx;
}

let noise;
{
    const N = Noise(0.001, 3);
    const N2 = Noise(0.002, 2);
    noise = (x, y) => {
        //const y0 = ch/2;
        const y0 = 0;
        const d = Math.abs(Math.min(1, (y-y0)/100));

        let n2 = N2(x, y);
        n2 = (n2 + 1)/2;
        n2 = Math.pow(n2, 3);
        n2 *= d;

        return n2 * N(x, y);
    };

    noise = N;
}

// temps
const G = vec2.create();
const V0 = vec2.create();
const V1 = vec2.create();
const V2 = vec2.create();
const V3 = vec2.create();
const V4 = vec2.create();
const V5 = vec2.create();

const min_dot = Math.cos(DEG2RAD * 2);

export class Trail {
    constructor() {
        this.pos = vec2.create();
        this.points = [];
        this.bbox = [0, 0, 0, 0];
        this.ttl = 0;
    }

    disjunct(box) {
        const bbox = this.bbox;
        if (bbox[0] > box[2] ||
            bbox[1] > box[3] ||
            bbox[2] < box[0] ||
            bbox[3] < box[1])
        {
            return true;
        }
        else
        {
            return false;
        }
    }

    reset(box) {
        // start in high area
        let x, y;
        for (;;) {
            x = lerp(box[0], box[2], Math.random());
            y = lerp(box[1], box[3], Math.random());
            break;
            //const n = noise(x, y);
            //if (Math.abs(n > 0.001)) break;
        }
        vec2.set(this.pos, x, y);
        this.points = [x, y];
        this.bbox = [x, y, x, y];
        this.ttl = ~~(lerp(50, 300, Math.random()));
    }

    update(n_iters=1) {
        const speed = 5000.0;
        const pos = this.pos;
        const points = this.points;
        const bbox = this.bbox;

        for (let iter = 0; iter < n_iters; ++iter) {
            if (this.ttl-- <= 0)
                break;

            const x = pos[0];
            const y = pos[1];
            gradient(G, x, y, noise);
            const x2 = (pos[0] += speed * G[0]);
            const y2 = (pos[1] += speed * G[1]);

            let add_point = false;
            {
                // is this point worth adding?
                const n = points.length;
                if (n >= 4) {
                    const P0 = V0;
                    const P1 = V1;
                    const P2 = V2;
                    const D01 = V3;
                    const D12 = V4;

                    P0[0] = points[n-4];
                    P0[1] = points[n-3];
                    P1[0] = points[n-2];
                    P1[1] = points[n-1];
                    P2[0] = x2;
                    P2[1] = y2;
                    vec2.sub(D01, P1, P0);
                    vec2.sub(D12, P2, P1);
                    vec2.normalize(D01, D01);
                    vec2.normalize(D12, D12);
                    if (vec2.dot(D01, D12) < min_dot) {
                        add_point = true;
                    }
                } else {
                    add_point = true;
                }
            }

            if (add_point) {
                this.points.push(x2, y2);
                // update bbox
                bbox[0] = Math.min(bbox[0], x2);
                bbox[2] = Math.max(bbox[2], x2);
                bbox[1] = Math.min(bbox[1], y2);
                bbox[3] = Math.max(bbox[3], y2);
            }
        }

        return this.ttl > 0;
    }
}
