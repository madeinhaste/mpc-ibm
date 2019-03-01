import {Trail} from './trail';
console.log('hello from trail.worker');

const requests = [];

self.onmessage = function(event) {
    const req = event.data;
    //console.log('worker: got', req);
    requests.push(req);
    process();
};

function process() {
    const req = requests.pop();
    if (!req)
        return;

    const trail = new Trail;
    trail.reset(req.birthbox);
    while (trail.update(100));

    const points = new Float32Array(trail.points);

    const result = {
        id: req.id,
        bbox: trail.bbox,
        points: points.buffer,
    };

    postMessage(result, [points.buffer]);
}
