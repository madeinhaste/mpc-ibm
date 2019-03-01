import {vec2} from 'gl-matrix';
import {assert, lerp, clamp, expovariate, random_gaussian} from './utils';
import SimplexNoise from 'simplex-noise';

const worker = new Worker('trail.worker.bundle.js');
const simplex = new SimplexNoise();
const canvas = document.querySelector('canvas');

const keystate = {};

const player = {
    pos: vec2.create(),
    vel: vec2.create(),
    dir: 0.0,
    turb: 0.0,
    speed: 1.0,
    ybest: 0,
};

const camera = {
    t: vec2.create(),
    target: null,
};

player.pos[0] = 0;
player.pos[1] = 0;

const route = [];
{
    let x = 0;
    let y = 0;
    let t = 0;

    for (let i = 0; i < 20; ++i) {
        route.push({
            x, y, t,
        });

        x += random_gaussian(500, 50);
        y += random_gaussian(0, 50);
    }
}

const trails = [];
const trail_hooks = {
    init_path(points) { return null; },
    free_path(path) {},
}

const STATE_DEAD = 0;
const STATE_PENDING = 1;
const STATE_ALIVE = 2;

let next_trail_spawn_time = 0;

{
    for (let i = 0; i < 1000; ++i) {
        const trail = {
            path: null,
            n_points: 0,
            bbox: null,
            state: STATE_DEAD,
            alpha: 0,
        };
        trails.push(trail);
    }
}

function bbox_disjunct(a, b) {
    if (a[0] > b[2] ||
        a[1] > b[3] ||
        a[2] < b[0] ||
        a[3] < b[1])
    {
        return true;
    }
    else
    {
        return false;
    }
}

function update_trails() {
    // viewport box
    const viewbox = [
        -camera.t[0],
        -camera.t[1],
        canvas.width - camera.t[0],
        canvas.height - camera.t[1]
    ];

    const birthbox = [
        lerp(viewbox[0], viewbox[2], 0.8),
        viewbox[1],
        viewbox[2],
        viewbox[3],
    ];


    // fix birthbox to be above/below the line at screen end
    {
        let r;
        for (let i = 0; i < route.length; ++i) {
            r = route[i];
            if (r.x > viewbox[2])
                break;
        }
        if (r) {
            const dy = random_gaussian(100, 30);
            if (Math.random() < 0.5) {
                birthbox[3] = r.y - dy;
            } else {
                birthbox[1] = r.y + dy;
            }
        }
    }

    const now = performance.now();

    for (let idx = 0; idx < trails.length; ++idx) {
        let trail = trails[idx];

        // kill out-of-view trails
        if (trail.state === STATE_ALIVE &&
            bbox_disjunct(viewbox, trail.bbox))
        {
            trail_hooks.free_path(trail.path);
            trail.path = null;
            trail.n_points = 0;
            trail.state = STATE_DEAD;
        }

        // request dead trails
        if (trail.state === STATE_DEAD &&
            now >= next_trail_spawn_time)
        {
            next_trail_spawn_time = now + 10;
            worker.postMessage({
                id: idx,
                birthbox: birthbox,
            });
            trail.state = STATE_PENDING;
        }

        if (trail.state === STATE_ALIVE)
            trail.alpha = Math.min(1, trail.alpha + 0.01);
    }
}

worker.onmessage = function(e) {
    //console.log('worker:', e.data);
    //return;

    const data = e.data;
    //console.log(`got: ${data.id}, ${data.points.length/2} points, bbox=${data.bbox}`);

    const trail = trails[data.id];
    assert(trail.state === STATE_PENDING);

    const points = new Float32Array(data.points);
    trail.path = trail_hooks.init_path(points);
    trail.n_points = points.length/2;
    trail.bbox = data.bbox;
    trail.state = STATE_ALIVE;
    trail.alpha = 0;
};

function update_player() {
    let ybest = 0;
    {
        // find line
        for (let i = 0; i < route.length; ++i) {
            const r = route[i];
            if (r.x > player.pos[0]) {
                //debug(''+i);
                if (i > 0) {
                    const r0 = route[i-1];
                    let u = (player.pos[0] - r0.x) / (r.x - r0.x);
                    ybest = lerp(r0.y, r.y, u);
                    //ybest = r0.y;
                }
                else
                {
                    ybest = r.y;
                }
                break;
            }
        }
    }
    player.ybest = ybest;

    {
        const dy = Math.abs(player.pos[1] - player.ybest);
        const mindist = 10;
        const d = (dy - mindist);

        if (d > 0) {
            const scl = 0.03;
            const d2 = 0.8*Math.min(1, d*0.01);
            const n = simplex.noise2D(scl*player.pos[0], scl*player.pos[1]);
            player.turb = lerp(player.turb, d2*n, 0.6);
        } else {
            player.turb = lerp(player.turb, 0, 0.1);
        }

        //debug(''+player.turb);
    }

    const turn_speed = 0.01;
    if (keystate.ArrowUp)
        player.dir -= turn_speed;
    if (keystate.ArrowDown)
        player.dir += turn_speed;

    const angle = player.dir + player.turb;
    player.vel[0] = player.speed * Math.cos(angle);
    player.vel[1] = player.speed * Math.sin(angle);
    vec2.add(player.pos, player.pos, player.vel);
}

function update_camera() {
    const cw = canvas.width;
    const ch = canvas.height;

    if (!camera.target) {
        // initialize target
        camera.target = vec2.fromValues(100, window.innerHeight/2);
        vec2.copy(camera.t, camera.target);
    } else {
        camera.target[1] = ch/2
    }

    const k = 7e-3;
    camera.t[0] = lerp(camera.t[0], camera.target[0] - player.pos[0], 5*k);
    camera.t[1] = lerp(camera.t[1], camera.target[1] - player.pos[1], k);
}

function update() {
    update_player();
    update_camera();
    update_trails();
}

document.onkeydown = document.onkeyup = e => {
    keystate[e.code] = (e.type == 'keydown') ? 1 : 0;
    //debug(`${e.code} ${keystate[e.code]}`);
};

export {
    camera,
    player,
    update,
    trails,
    route,
    trail_hooks,
    STATE_ALIVE,
};
