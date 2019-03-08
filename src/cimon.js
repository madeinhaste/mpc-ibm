import {parse_OBJ} from './obj-parser';
import {create_buffer, create_program, create_texture, GLSL} from './webgl';
import {mat3, mat4, vec3, vec4, quat} from 'gl-matrix';
import SimplexNoise from 'simplex-noise';
import {ray_sphere_intersect} from './geom-utils';
import {assert, lerp, clamp, each_line, expovariate} from './utils';
import {Howl, Howler} from 'howler';

let visemes = null;
(function() {
    fetch('data/cimon-visemes.txt')
        .then(r => r.text())
        .then(text => {
            const data = [];
            each_line(text, line => {
                data.push.apply(data,
                    line.split('; ')
                        .map(parseFloat));
            });
            return new Float32Array(data);
        })
        .then(data => {
            visemes = data;
            console.log('got visemes:', data.length/15);
        });
}());

export function init_cimon() {
    let speech_started = -Infinity;
    let speech_duration;
    let speech_playing = false;
    let speech_count = 0;

    const sounds = {
        ambience: new Howl({
            src: ['sounds/cimon_ambience.mp4'],
            autoplay: true,
            loop: true,
        }),
        speech: new Howl({
            src: ['sounds/cimon_fx.mp4'],
            preload: true,
            onload() {
                speech_duration = this.duration() * 1000;
            },
            onplay() {
                //console.log('play');
                speech_started = performance.now();
                speech_playing = true;
                ++speech_count;
            },
            onend() {
                console.log('end');
                speech_playing = false;
            },
        }),
    };

    sounds.ambience.play();

    //let next_bing_time = 0;
    //const bing_interval = 3000;

    //const model_url = 'data/grp016_tri.obj';
    const model_url = 'data/cimon_001.obj';

    fetch(model_url)
        .then(r => r.text())
        .then(parse_OBJ)
        .then(init_mesh_from_obj);

    const buffers = {
        positions: null,
        normals: null,
        texcoords: null,
        elements: null,
    };

    const textures = {
        color: load_texture('images/cimon/grp016_AlbedoM.png'),
        faces: load_face_textures(),
    };

    let face_idx = 0;
    let next_face_time = 3000;

    function load_face_textures() {
        return Array.from('abcde')
            .map(ch => load_texture(
                `images/cimon/faces/screenface_${ch}.png`));
    }

    const actor = {
        pos: vec3.create(),
        pos0: vec3.create(),
        rot: quat.create(),
        ang: vec3.create(),

        // impulse
        acc: vec3.create(),

        interest: vec3.create(),
        interest_target: vec3.create(),
        interest_ttl: 0,
    };

    let num_verts;
    let num_elems;
    let parts;

    const program = make_program();
    const mat = mat4.create();
    const noise = Noise(0.1, 1);

    function init_mesh_from_obj(obj) {
        buffers.positions = create_buffer(gl.ARRAY_BUFFER, obj.positions);
        buffers.normals = create_buffer(gl.ARRAY_BUFFER, obj.normals);
        buffers.texcoords = create_buffer(gl.ARRAY_BUFFER, obj.texcoords);
        buffers.elements = create_buffer(gl.ELEMENT_ARRAY_BUFFER, obj.elements);
        num_verts = obj.n_vertices;
        num_elems = obj.n_elements;
        parts = obj.parts;
        console.log(parts);
    }

    // temps
    const Q = quat.create();
    const Q2 = quat.create();
    const V = vec3.create();
    const M = mat3.create();
    const tmp = vec3.create();

    // frame
    const F = vec3.create();
    const R = vec3.create();
    const U = vec3.create();

    function add_force(acc) {
        if (actor.pos[2] > 0) {
            vec3.add(actor.acc, actor.acc, acc);
            face_idx = 2;
        }
    }

    function update_visemes() {
        if (!speech_playing)
            return;

        const now = performance.now();
        const time = (now - speech_started) / 1000;

        let max_idx = 0;
        let curr_frame;
        if (visemes) {
            const n_frames = visemes.length / 15;
            curr_frame = clamp(Math.round(time * 100), 0, n_frames - 1);

            //let max_idx = 0;
            let max_val = 0;
            let sp = 15 * curr_frame;
            for (let i = 0; i < 15; ++i) {
                const value = visemes[sp + i];
                if (value > max_val) {
                    max_val = value;
                    max_idx = i;
                }
            }

            //debug(max_idx);
        } else {
            curr_frame = 0;
        }

        switch (max_idx) {
        case 0:
            face_idx = 4;
            break;
        case 1: case 4:
            face_idx = 0;
            break;
        case 7:
            face_idx = 0;
            break;
        case 8: case 11:
            face_idx = 2;
            break;
        default:
            face_idx = 1;
            break;
        /*
        case 1: case 4: case 7:
            face_idx = 0;
            break;
        case 2: case 5: case 8: case 11:
            face_idx = 2;
            break;
        case 3: case 6: case 9: case 12:
            face_idx = 3;
            break;
        case 10: case 13: case 14:
            face_idx = 1;
            break;
            */
        }
    }

    function update(env) {
        {
            const now = env.time;
            let delay
            if (now > next_face_time) {
                if (face_idx > 0) {
                    face_idx = 0;
                    delay = expovariate(2000);
                } else {
                    face_idx = ~~(textures.faces.length * Math.random());
                    delay = expovariate(1000);
                }
                next_face_time = now + delay;
            }
        }

        update_visemes();

        // move to a random location
        const dt = env.dt / 1000;
        const dt2 = dt*dt;
        const pos = actor.pos;
        const pos0 = actor.pos0;
        const acc = actor.acc;

        if (1) {
            const t = 0.001 * env.time;
            // target pos
            vec3.set(V, 0.3 * noise(t, 0.0), 0.3 * noise(0.3, -t), 0.3);

            /*
            // delta
            vec3.sub(V, pos, V);
            // direction
            vec3.normalize(V, V);
            vec3.scale(acc, V, 0.01);
            */
            vec3.lerp(pos, pos, V, 0.2*dt);
        }

        {
            // http://lonesock.net/article/verlet.html
            // integrate
            // pos = pos0 + (pos - pos0)*damp + acc*dt*dt
            const damp = 0.9;
            vec3.copy(tmp, pos);
            vec3.sub(V, pos, pos0);
            vec3.scaleAndAdd(pos, pos, V, damp);
            vec3.scaleAndAdd(pos, pos, acc, dt);
            vec3.copy(pos0, tmp);

            // reset
            vec3.set(acc, 0,0,0);
        }

        // look to camera
        //mat4.identity(mat);
        //mat4.targetTo(mat, actor.pos, env.camera.view_pos, [0,1,0]);
        //mat3.fromMat4(R, mat);
        //quat.fromMat3(Q, mat);

        //vec3.scaleAndAdd(V, V, env.pickray.direction, 10);
        //const target = V;
        //console.log(actor.pos, target);

        //const target = env.camera.view_pos;

        {
            // update interest
            actor.interest_ttl -= dt;
            let l;
            if (actor.interest_ttl < 0) {
                // reset to camera
                vec3.copy(actor.interest_target, env.camera.view_pos);
                l = 0.01;
            } else {
                l = 0.1;
            }
            vec3.lerp(actor.interest, actor.interest, actor.interest_target, l);
        }

        //vec3.copy(V, env.pickray.origin);
        //vec3.scaleAndAdd(V, V, env.pickray.direction, 1);

        const target = actor.interest;
        vec3.sub(F, target, actor.pos);
        vec3.normalize(F, F);
        vec3.negate(F, F);  // flip

        vec3.set(U, 0,1,0);
        vec3.cross(R, U, F);
        vec3.normalize(R, R);

        vec3.cross(U, F, R);
        vec3.normalize(U, U);

        M[0] = R[0];
        M[3] = R[1];
        M[6] = R[2];

        M[1] = U[0];
        M[4] = U[1];
        M[7] = U[2];

        M[2] = F[0];
        M[5] = F[1];
        M[8] = F[2];
        mat3.invert(M, M);

        //quat.setAxes(Q, F, R, U);

        //quat.identity(Q);
        quat.fromMat3(Q, M);
        quat.copy(actor.rot, Q);

        //quat.identity(Q2);
        //quat.rotateY(Q2, Q2, Math.PI);
        //quat.mul(Q, Q, Q2);

        //quat.lerp(Q, actor.rot, Q, 0.1);
        //quat.normalize(Q, Q);
        //quat.copy(actor.rot, Q);

        // how to keep him pointing up??

        /*
        if (0) {
            // -z => camera
            quat.rotationTo(Q, [0,0,1], V);
            quat.normalize(Q, Q);
            quat.lerp(Q, actor.rot, Q, 0.1);
            quat.normalize(Q, Q);
            quat.copy(actor.rot, Q);
        }

        if (0) {
            // +y -> up
            vec3.transformQuat(V, [0,1,0], Q);
            quat.rotationTo(Q, V, [0,1,0]);
            quat.scale(Q, Q, 0.1);
            quat.mul(actor.rot, actor.rot, Q);
        }
        */
    }

    function draw(env) {
        if (!num_elems)
            return;

        {
            mat4.fromRotationTranslation(mat, actor.rot, actor.pos);
            mat4.mul(mat, env.camera.mvp, mat);
        }

        const pgm = program.use();
        pgm.uniformMatrix4fv('u_mvp', mat);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positions);
        pgm.vertexAttribPointer('a_position', 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normals);
        pgm.vertexAttribPointer('a_normal', 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoords);
        pgm.vertexAttribPointer('a_texcoord', 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.elements);

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);

        pgm.uniform4f('u_color', 0.5, 0.2, 0.1, 1.0);

        let start = 0;
        for (let i = 0; i < parts.length; ++i) {
            const part = parts[i];
            const tex = (part.name == 'cimon_shell') ? textures.color : textures.faces[face_idx];
            pgm.uniformSampler2D('u_tex_color', tex);
            gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_SHORT, start << 1);
            start += part.count;
        }

        // gl.enable(gl.BLEND);
        // gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        // pgm.uniform4f('u_color', 1.0, 0.8, 0.1, 1.0);
        // gl.drawElements(gl.POINTS, num_elems, gl.UNSIGNED_SHORT, 0);
        // gl.disable(gl.BLEND);

         gl.disable(gl.DEPTH_TEST);
         gl.disable(gl.CULL_FACE);
    }

    function hit_test(env) {
        const ray = env.pickray;
        const sph = vec4.create();
        vec4.copy(sph, actor.pos);
        sph[3] = 0.20;    // radius
        const t = ray_sphere_intersect(sph, ray.origin, ray.direction);
        //console.log('hit:', t);
        return t > 0;
    }

    function set_interest(env) {
        const ray = env.pickray;
        vec3.scaleAndAdd(V, ray.origin, ray.direction, 1);
        vec3.copy(actor.interest_target, V);
        //console.log(actor.interest_target);
        actor.interest_ttl = lerp(0.5, 3.0, Math.random());
        //console.log(actor.interest_ttl);
        //const target = V;
        //console.log(actor.pos, target);
        //const sph = vec4.create();
        //vec4.copy(sph, actor.pos);
        //sph[3] = 0.20;    // radius
        //const t = ray_sphere_intersect(sph, ray.origin, ray.direction);
        //console.log('hit:', t);
        //return t > 0;
    }

    function start_speech(env) {
        if (!speech_playing && (speech_count < 1))
            sounds.speech.play();
    }

    return {update, draw, add_force, hit_test, set_interest, start_speech};
}

function make_program() {
    return create_program({
        name: 'cimon',
        vertex: GLSL`
            attribute vec3 a_position;
            attribute vec3 a_normal;
            attribute vec2 a_texcoord;

            varying vec3 v_normal;
            varying vec2 v_texcoord;

            uniform mat4 u_mvp;

            void main() {
                gl_Position = u_mvp * vec4(a_position, 1.0);
                gl_PointSize = 3.0;
                v_normal = a_normal;
                v_texcoord = a_texcoord;
            }
        `,
        fragment: GLSL`
            precision mediump float;

            varying vec3 v_normal;
            varying vec2 v_texcoord;

            uniform vec4 u_color;
            uniform sampler2D u_tex_color;
            uniform sampler2D u_tex_gloss;
            uniform sampler2D u_tex_normal;

            void main() {
                vec3 C = (normalize(v_normal) + 1.0)/2.0;

                C = texture2D(u_tex_color, v_texcoord).rgb;
                gl_FragColor = vec4(C, 0.0);
            }
        `,
    });
}

function load_texture(url) {
    const texture = create_texture({
        size: 4,
        min: gl.LINEAR_MIPMAP_LINEAR,
        mag: gl.LINEAR,
    });
    gl.generateMipmap(gl.TEXTURE_2D);

    const img = new Image;
    img.src = url;
    img.onload = _ => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
    };

    return texture;
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
