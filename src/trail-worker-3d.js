import {vec3} from 'gl-matrix';
import {random_gaussian} from './utils';

self.onmessage = e => process(e.data);

function update_bounds(bounds, pos) {
    for (let i = 0; i < 3; ++i) {
        bounds[i + 0] = Math.min(bounds[i + 0], pos[i]);
        bounds[i + 3] = Math.max(bounds[i + 3], pos[i]);
    }
}

function process(req) {
    const pos = vec3.clone(req.start);
    const points = new Float32Array(3 * req.count);
    const bounds = [0, 0, 0, 0, 0, 0];
    let dp = 0;
    for (let i = 0; i < req.count; ++i) {
        points[dp + 0] = pos[0];
        points[dp + 1] = pos[1];
        points[dp + 2] = pos[2];
        dp += 3;

        update_bounds(bounds, pos);

        pos[0] += random_gaussian(0, 0.05);
        pos[1] += random_gaussian(0, 0.05);
        pos[2] += 5.0;
    }
    
    // post
    const result = {
        points: points.buffer,
        bounds,
    };

    postMessage(result, [points.buffer]);
}
