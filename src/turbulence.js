import SimplexNoise from 'simplex-noise';
import {vec2} from 'gl-matrix';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const cw = canvas.width = 1024;
const ch = canvas.height = 512;
ctx.fillStyle = 'black';
ctx.fillRect(0, 0, cw, ch);

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
        const y0 = ch/2;
        const d = Math.abs(Math.min(1, (y-y0)/100));

        let n2 = N2(x, y);
        n2 = (n2 + 1)/2;
        n2 = Math.pow(n2, 3);
        n2 *= d;

        return n2 * N(x, y);
    };
}

// draw the noise field
if (0) {
    const image_data = ctx.getImageData(0, 0, cw, ch);
    const pixels = image_data.data;
    let dp = 0;
    for (let y = 0; y < ch; ++y) {
        for (let x = 0; x < cw; ++x) {
            //const v = (x + y) & 255;
            const v = noise(x, y);
            const vv = ~~(128*(v + 1));
            pixels[dp + 0] = 0;
            pixels[dp + 1] = vv;
            pixels[dp + 2] = vv;
            pixels[dp + 3] = 255;
            dp += 4;
        }
    }
    ctx.putImageData(image_data, 0, 0);
}

// need some animated particles..
function lerp(a, b, x) {
    return (1-x)*a + x*b;
}

class Trail {
    constructor() {
        this.pos = vec2.create();
        this.ttl = 0;
        const r = ~~lerp(200, 255, Math.random());
        const g = ~~lerp(220, 255, Math.random());
        const b = ~~lerp(240, 255, Math.random());
        this.color = `rgb(${r},${g},${b})`;
        this.bias = vec2.create();
    }

    reset() {
        // start in high area
        for (;;) {
            const x = cw*Math.random();
            const y = ch*Math.random();
            const n = noise(x, y);
            if (Math.abs(n > 0.001)) {
                vec2.set(this.pos, x, y);
                break;
            }
        }
        vec2.set(this.bias, Math.random()-0.5, Math.random()-0.5);
        this.ttl = ~~(lerp(500, 1000, Math.random()));
    }
}

const n_trails = 200;
const trails = [];
for (let i = 0; i < n_trails; ++i) {
    const t = new Trail;
    t.reset();
    trails.push(t);
}

// animate the trails
if (1) {

    function animate() {
        requestAnimationFrame(animate);

        ctx.globalAlpha = 0.9;
        const G = vec2.create();
        const speed = 5000.0;
        const steps = 100;
        for (let i = 0; i < n_trails; ++i) {
            const trail = trails[i];
            ctx.strokeStyle = trail.color;

            ctx.beginPath();
            let first = true;
            for (let iter = 0; iter < steps; ++iter) {
                if (--trail.ttl <= 0) {
                    ctx.stroke();
                    ctx.beginPath();
                    first = true;
                    trail.reset();
                }

                const pos = trail.pos;
                const x0 = pos[0];
                const y0 = pos[1];
                gradient(G, x0, y0, noise);
                //vec2.scaleAndAdd(G, G, trail.bias, 0.00001);
                const x1 = (pos[0] += speed * G[0]);
                const y1 = (pos[1] += speed * G[1]);

                if (first) {
                    ctx.moveTo(x0, y0);
                    first = false;
                }
                ctx.lineTo(x1, y1);
            }
            ctx.stroke();
        }
    }

    animate();
}

// draw the gradient
if (0) {
    const G = vec2.create();
    const step = 10;
    ctx.strokeStyle = '#ff0';
    const k = 8000;
    for (let y = 0; y < ch; y += step) {
        for (let x = 0; x < cw; x += step) {
            gradient(G, x, y, noise);
            ctx.moveTo(x, y);
            ctx.lineTo(x + k*G[0], y + k*G[1]);
        }
    }
    ctx.stroke();
}
