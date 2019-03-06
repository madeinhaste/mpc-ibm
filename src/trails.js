import {assert, lerp, random_gaussian} from './utils';
import {create_buffer, create_program, GLSL} from './webgl';
import {mat3, mat4, vec2, vec3, vec4, quat} from 'gl-matrix';

const STATE_DEAD = 0;
const STATE_PENDING = 1;
const STATE_ALIVE = 2;

export const max_length = 256;
export const max_count = 16;
export const vertex_stride = 4;

let trails = [];
let vertex_data;
let vertex_buffer;
let next_request_time = 0;
const request_interval = 300;

const worker = new Worker('./bundles/trails-worker.bundle.js');

export function init_trails() {
    vertex_data = new Float32Array(vertex_stride * max_length * max_count);
    vertex_buffer = create_buffer(gl.ARRAY_BUFFER, vertex_data);

    trails = [];
    for (let i = 0; i < max_count; ++i) {
        const trail = {
            state: STATE_DEAD,
            zmin: 0,
            length: 0,
        };
        trails.push(trail);
    }

    function update(persp, cps) {
        const now = performance.now();

        const zmax = persp.pos[2] + persp.zrange[0];
        let requested_idxs = []
        for (let i = 0; i < max_count; ++i) {
            const trail = trails[i];

            if (trail.state === STATE_PENDING)
                continue;

            // prune/request
            if (trail.state === STATE_ALIVE && trail.zmin > zmax) {
                trail.state = STATE_DEAD;
            }

            if (trail.state === STATE_DEAD &&
                now > next_request_time)
            {
                trail.state = STATE_PENDING;
                next_request_time += request_interval;
                requested_idxs.push(i);
            }
        }

        if (requested_idxs.length) {
            worker.postMessage({ cps, idxs: requested_idxs });
        }
    }

    const program = create_program({
        name: 'trails',
        vertex: GLSL`
            attribute vec3 a_position;
            uniform mat4 u_mvp;
            //varying float v_fog;
            //uniform mat4 u_view;
            //uniform vec2 u_fogrange;

            void main() {
                vec4 P = vec4(a_position, 1.0);

                /*
                {
                    float z = -(u_view * P).z;
                    float fog = 1.0 - clamp(
                        (z - u_fogrange[0]) / (u_fogrange[1] - u_fogrange[0]),
                        0.0,
                        1.0);
                    v_fog = fog * fog;
                }
                */

                gl_Position = u_mvp * P;
                //gl_PointSize = u_pointsize;
            }
        `,
        fragment: GLSL`
            precision highp float;
            //varying float v_fog;
            uniform vec4 u_color;

            void main() {
                //gl_FragColor = v_fog * u_color;
                gl_FragColor = u_color;
            }
        `,
    });


    function draw(persp) {
        const pgm = program.use();
        pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
        pgm.uniform4f('u_color', 1.0, 0.0, 0.0, 1.0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
        pgm.vertexAttribPointer('a_position', 4, gl.FLOAT, false, 0, 0);

        gl.lineWidth(2);
        for (let i = 0; i < max_count; ++i) {
            const trail = trails[i];
            if (trail.state !== STATE_ALIVE)
                continue;

            const start = i * max_length;
            const count = trail.length;
            //console.log('draw:', start, count);
            gl.drawArrays(gl.LINE_STRIP, start, count);
        }
        gl.lineWidth(1);
    }

    return { update, draw };
}

worker.onmessage = function(e) {
    const idx = e.data.idx;
    const P = new Float32Array(e.data.P);

    const trail = trails[idx];
    assert(trail.state === STATE_PENDING);
    trail.length = P.length / vertex_stride;

    {
        // get the z coord of last vertex
        //const sp = vertex_stride * (trail.length - 1);
        const sp = 0;
        trail.zmin = P[sp + 2];
    }

    const dp = vertex_stride * max_length * idx;
    vertex_data.set(P, dp);

    {
        const byte_offset = dp << 2;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, byte_offset, P);
    }

    trail.state = STATE_ALIVE;
    //console.log('new trail:', idx, trail.length, trail.zmax);
};
