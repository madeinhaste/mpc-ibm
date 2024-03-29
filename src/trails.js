import {assert, lerp, random_gaussian} from './utils';
import {create_buffer, create_program, GLSL} from './webgl';
import {mat3, mat4, vec2, vec3, vec4, quat} from 'gl-matrix';
import {max_count, max_length, vertex_stride} from './trails-common';

const STATE_DEAD = 0;
const STATE_PENDING = 1;
const STATE_ALIVE = 2;

let trails = [];
let vertex_data;
let vertex_buffer;
let next_request_time = 0;
const request_interval = 300;
let time = 0.0;

const worker = new Worker('./bundles/trails-worker.bundle.js');

function make_palette(aa, bb, cc, dd) {
    function expand(v) {
        if (Array.isArray(v))
            return [v[0], v[1], v[2]];
        else
            return [v, v, v];
    }

    var a = expand(aa);
    var b = expand(bb);
    var c = expand(cc);
    var d = expand(dd);

    return function(out, t) {
        for (var i = 0; i < 3; ++i)
            out[i] = a[i] + b[i] * Math.cos(2*Math.PI * (c[i]*t + d[i]));
        return out;
    }
}
const palette = make_palette(0.5, 0.5, 1, [0, 0.33, 0.67]);

export function init_trails() {
    vertex_data = new Float32Array(vertex_stride * max_length * max_count);
    vertex_buffer = create_buffer(gl.ARRAY_BUFFER, vertex_data);

    trails = [];
    for (let i = 0; i < max_count; ++i) {
        const trail = {
            state: STATE_DEAD,
            zmin: 0,
            length: 0,
            color: vec3.create(),
            time_offset: Math.random(),
        };
        palette(trail.color, Math.random());
        trails.push(trail);
    }

    function update_palette(params) {
        const c0 = params.trail_color_0;
        const c1 = params.trail_color_1;

        trails.forEach(t => {
            // use for random parameter
            const u = t.time_offset;
            const out = t.color;
            vec3.lerp(out, c0, c1, u);
            vec3.scale(out, out, 1/255);
        });
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

    const trails2_program = create_program({
        name: 'trails2',
        vertex: GLSL`
            attribute vec4 a_P;
            attribute vec4 a_Q;

            varying vec2 v_coord;
            varying float v_fog;

            uniform mat4 u_mvp;
            uniform mat4 u_view;
            uniform vec2 u_fogrange;
            uniform vec2 u_scale;
            uniform float u_time_offset;

            vec3 transform_quat(vec3 v, vec4 q) {
                vec3 t = 2.0 * cross(q.xyz, v);
                return v + q.w*t + cross(q.xyz, t);
            }

            void main() {
                vec3 P;
                vec4 Q;
                float time;
                float side;

                {
                    Q = a_Q;
                    P = a_P.xyz;
                    time = abs(a_P.w);
                    time = fract(-time + u_time_offset);
                    time = smoothstep(0.0, 0.3, time);
                    side = sign(a_P.w);

                    float scl = u_scale.x;

                    {
                        scl *= (1.0 - 4.0*pow(time - 0.5, 2.0));
                    }

                    P += transform_quat(scl * vec3(side, 0, 0), Q);

                    v_coord[0] = 0.5*(side + 1.0);
                    v_coord[1] = time;
                }

                {
                    float z = -(u_view * vec4(P, 1.0)).z;
                    float fog = 1.0 - clamp(
                        (z - u_fogrange[0]) / (u_fogrange[1] - u_fogrange[0]),
                        0.0,
                        1.0);
                    v_fog = fog;
                }

                gl_Position = u_mvp * vec4(P, 1.0);
                gl_PointSize = 3.0;
            }
        `,
        fragment: GLSL`
            precision highp float;
            varying float v_fog;
            varying vec2 v_coord;
            uniform vec3 u_color;

            void main() {
                float a = 2.0*(v_coord.x - 0.5);
                a = 1.0 - a*a;
                gl_FragColor = vec4(u_color, a * v_fog);
                /*
                gl_FragColor = vec4(
                    vec3(1.0-(0.3*v_fog)),
                    1.0);
                    */
            }
        `,
    });

    function draw(persp) {
        const pgm = program.use();
        pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
        pgm.uniform4f('u_color', 1.0, 0.0, 0.0, 1.0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
        const byte_stride = 4 * vertex_stride;
        pgm.vertexAttribPointer('a_position', 4, gl.FLOAT, false, byte_stride, 0);

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

    function draw2(env) {
        time += 0.005;
        const pgm = trails2_program.use();
        //const ext = env.ext.instanced;

        pgm.uniformMatrix4fv('u_mvp', env.persp.viewproj);
        pgm.uniformMatrix4fv('u_view', env.persp.view);
        //pgm.uniform4f('u_color0', 0.0, 0.8, 1.0, 1.0);
        //pgm.uniform4f('u_color1', 0.5, 0.2, 0.4, 1.0);
        pgm.uniform2fv('u_fogrange', env.fog_range);
        pgm.uniform2f('u_scale', env.params.trail_width, 1.0);

        gl.enable(gl.BLEND);
        const params = env.params;
        if (params.trail_blend === 'add')
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        else
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        //gl.blendFunc(gl.DST_COLOR, gl.ZERO);
        //gl.enable(gl.DEPTH_TEST);
        //gl.enable(gl.CULL_FACE);
        //gl.disable(gl.CULL_FACE);

        // non-instanced attribs
        //gl.bindBuffer(gl.ARRAY_BUFFER, env.shape_buffer);
        //pgm.vertexAttribPointer('a_position', 3, gl.FLOAT, false, 0, 0);

        // instanced attribs
        gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);

        const attr_P = pgm.enableVertexAttribArray('a_P');
        //ext.vertexAttribDivisorANGLE(attr_P, 1);

        const attr_Q = pgm.enableVertexAttribArray('a_Q');
        //ext.vertexAttribDivisorANGLE(attr_Q, 1);

        // TODO
        const trails_count = Math.floor(env.params.trail_amount);
        for (let i = 0; i < trails_count; ++i) {
            const trail = trails[i];
            if (trail.state !== STATE_ALIVE)
                continue;

            pgm.uniform3fv('u_color', trail.color);
            pgm.uniform1f('u_time_offset', time + trail.time_offset);

            //const start = i * max_length;
            //const count = trail.length;
            //console.log('draw:', start, count);
            //gl.drawArrays(gl.LINE_STRIP, start, count);

            const byte_offset = 4 * vertex_stride * max_length * i;
            const byte_stride = 4 * (vertex_stride >> 1);
            const count = trail.length << 1;

            gl.vertexAttribPointer(attr_P, 4, gl.FLOAT, false, byte_stride, byte_offset + 0);
            gl.vertexAttribPointer(attr_Q, 4, gl.FLOAT, false, byte_stride, byte_offset + 16);
            //ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, env.n_shape_verts, count);
            //gl.drawArrays(gl.LINE_STRIP, 0, count);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, count);
        }
        // reset divisors
        //ext.vertexAttribDivisorANGLE(attr_P, 0);
        //ext.vertexAttribDivisorANGLE(attr_Q, 0);

        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
    }

    return {
        update,
        update_palette,
        draw: draw2,
    };
}

worker.onmessage = function(e) {
    const idx = e.data.idx;
    const P = new Float32Array(e.data.P);

    // duplicate verts
    if (1) {
        for (let dp = 0; dp < P.length; dp += vertex_stride) {
            let dp2 = dp + 8;
            P[dp2++] = P[dp + 0];
            P[dp2++] = P[dp + 1];
            P[dp2++] = P[dp + 2];
            P[dp2++] = -P[dp + 3];  // negate time
            P[dp2++] = P[dp + 4];
            P[dp2++] = P[dp + 5];
            P[dp2++] = P[dp + 6];
            P[dp2++] = P[dp + 7];
        }
    }

    const trail = trails[idx];
    assert(trail.state === STATE_PENDING);
    trail.length = P.length / vertex_stride;
    trail.time_offset = -time;

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
