import './reloader';
import {mat3, mat4, vec2, vec3, vec4, quat} from 'gl-matrix';
import {assert, lerp, clamp, random_gaussian, DEG2RAD, resize_canvas_to_client_size, redraw_func, $} from './utils';
import SimplexNoise from 'simplex-noise';
import {ready as sobol_ready} from './sobol';

const canvas = $('canvas');
const ctx = canvas.getContext('2d');

let aerial = false;
let noise = Noise(0.005, 2);

let sobol = null;
sobol_ready.then(SobolSequence => {
    console.log('got sobol sequence');
    sobol = new SobolSequence(1);
    //for (let i = 0; i < 100; ++i) console.log(sobol.nextVector());
});

const cursor = vec2.create();
const radius = 50;  // tunnel radius

const guide = {
    cps: [],
    iter_cps(func) {
        const cps = this.cps;
        for (let i = 0; i < cps.length; i += 2) {
            const x = cps[i + 0];
            const y = cps[i + 1];
            func(i, x, y);
        }
    },
    // return y for x
    sample(xc) {
        const cps = this.cps;
        if (!cps.length)
            return 0;

        let i;
        for (i = 0; i < cps.length; i += 2) {
            const x = cps[i + 0];
            if (x > xc)
                break;
        }

        if (i === 0)
            return cps[i + 1];

        const x0 = cps[i - 2];
        const y0 = cps[i - 1];
        const x1 = cps[i + 0];
        const y1 = cps[i + 1];

        const u = (xc - x0) / (x1 - x0);
        return lerp(y0, y1, u);
    }
};

const sobol_points = [];

const parts = [];
const n_parts = 1000;
{
    for (let i = 0; i < n_parts; ++i) {
        const part = {
            P: vec2.create(),
            trail: [],
            ttl: ~~(lerp(10, 100, Math.random())),
        };
        parts.push(part);
    }
}

function reset_guide() {
    const cw = canvas.width;
    const ch = canvas.height;
    let P = vec2.create();
    P[0] = 0;
    P[1] = random_gaussian(ch/2, 10);

    guide.cps = [];
    for (;;) {
        guide.cps.push(P[0], P[1]);

        if (P[0] >= cw)
            break;

        P[0] += random_gaussian(cw/10, 10);
        P[1] += random_gaussian(0, 40);
    }
}

const debug = function() {
    const el = $('.debug');
    return s => (el.innerHTML = s);
}();

const V = vec2.create();

function update_parts() {
    const cw = canvas.width;
    const ch = canvas.height;

    parts.forEach(part => {
        const P = part.P;

        if (part.ttl-- <= 0) {
            P[0] = lerp(cw/3, cw, Math.random());

            const cy = guide.sample(P[0]);

            {
                const d = (Math.random() < 0.5) ? -1 :1;

                let u;
                if (1 && sobol) {
                    const s = sobol.nextVector();
                    u = s[0];
                } else {
                    u = Math.random();
                }

                P[1] = cy + d * lerp(radius, 5*radius, u);
            }

            part.trail = [];
            part.ttl = clamp(~~random_gaussian(300, 50), 50, 500);
        }

        // add to trail
        part.trail.push(P[0], P[1]);

        // advect
        if (1) {
            gradient(V, P[0], P[1], noise);
            vec2.scale(V, V, 2000);
        } else {
            V[0] = V[1] = 0;
        }

        V[0] += -1;
        V[1] += 0;

        //V[1] = random_gaussian(0, 1);

        // avoid tunnel
        const yc = guide.sample(P[0]);
        const dy = (P[1] - yc) / (radius+10);
        const dy2 = dy*dy;

        if (dy2 < 1) {
            //const f = 1 - 2*dy + dy*dy;
            V[1] += 2*(1-dy2) * dy;
        }

        vec2.add(P, P, V);
    });
}

function draw_parts() {
    ctx.strokeStyle = '#080';
    ctx.fillStyle = '#0f0';
    parts.forEach(part => {
        const trail = part.trail;
        ctx.beginPath();
        for (let i = 0; i < trail.length; i += 2) {
            const x = trail[i + 0];
            const y = trail[i + 1];
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();

        const x = part.P[0];
        const y = part.P[1];
        ctx.fillRect(x-1, y-1, 3, 3);
    });
}

function draw() {
    resize_canvas_to_client_size(canvas, false);

    if (!guide.cps.length)
        reset_guide();

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    // draw guide
    ctx.strokeStyle = '#f04';
    ctx.beginPath();
    const r = radius;
    guide.iter_cps((i, x, y) => {
        i ? ctx.lineTo(x, y+r) : ctx.moveTo(x, y+r);
    });
    guide.iter_cps((i, x, y) => {
        i ? ctx.lineTo(x, y-r) : ctx.moveTo(x, y-r);
    });
    ctx.stroke();

    ctx.fillStyle = '#f04';
    guide.iter_cps((i, x, y) => {
        ctx.fillRect(x-1, y-1, 3, 3);
    });

    // draw cursor
    {
        ctx.fillStyle = '#0ff';
        ctx.beginPath();
        const cx = cursor[0];
        const cy = guide.sample(cx);
        ctx.arc(cx, cy, 5, 0, 2*Math.PI);
        ctx.closePath();
        ctx.fill();
    }

    draw_parts();

    /*
    if (sobol) {
        const P = sobol.nextVector();
        sobol_points.push(P[0], P[1]);
        ctx.fillStyle = '#ff0';
        for (let i = 0; i < sobol_points.length; i += 2) {
            const x = cw * sobol_points[i + 0];
            const y = ch * sobol_points[i + 1];
            ctx.fillRect(x-1, y-1, 3, 3);
        }
    }
    */
}

function animate() {
    requestAnimationFrame(animate);
    update_parts();
    draw();
}

animate();

document.onkeydown = e => {
    if (e.code == 'KeyA') {
        aerial = !aerial;
        debug(aerial ? 'aerial' : 'persp');
        e.preventDefault();
    }

    else if (e.code == 'Space') {
        reset_guide();
        e.preventDefault();
    }
};

document.onmousemove = e => {
    cursor[0] = e.offsetX;
    cursor[1] = e.offsetY;
};

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
