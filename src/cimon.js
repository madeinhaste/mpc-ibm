import {parse_OBJ} from './obj-parser';
import {create_buffer, create_program, create_texture, GLSL} from './webgl';
import {vec2, mat3, mat4, vec3, vec4, quat} from 'gl-matrix';
import SimplexNoise from 'simplex-noise';
import {ray_sphere_intersect, copy_vec2, copy_vec3} from './geom-utils';
import {assert, lerp, clamp, each_line, expovariate} from './utils';
import {assets} from './cimon-common.js';
import audiosprites from './cimon-audio-sprites.js';
import {Howl, Howler} from './howler';
import {fade_and_stop_sounds} from './misc';
import {init_cimon_dynamic} from './cimon-dynamic';
import {api_get} from './cimon-api';
import face_anim from './cimon-face-anim';

export function init_cimon(gl_ext, end_callback) {

    let speech_started = -Infinity;
    let speech_duration;
    let speech_playing = false;
    let speech_count = 0;

    const sounds = {
        ambient: assets.sound('sounds/cimon-ambient', {autoplay: true, loop:true}),
        vocal: assets.sound('sounds/cimon-intro', {
            onload() {
                speech_duration = 1000 * this.duration();
            },
            onplay() {
                speech_started = performance.now();
                speech_playing = true;
                ++speech_count;
            },
            /*
            onend() {
                console.log('end');
                speech_playing = false;
                if (end_callback)
                    end_callback();
            },
            */
        }),
    };

    let sounds_dynamic = null;
    let hours_until_overhead = 0;

    if (1 && Howler.usingWebAudio) {
        sounds_dynamic = init_cimon_dynamic();
        api_get('hours').then(ob => {
            hours_until_overhead = ob.h;
            console.log('cimon: hours until overhead =', ob.h.toFixed(1));
        });
    } else {
            console.log('cimon: no dynamic');
    }

    sounds.ambient.play();

    assets.text('data/cimon-model.obj')
        .then(parse_OBJ)
        .then(init_mesh_from_obj);

    const buffers = {
        positions: null,
        normals: null,
        tangents: null,
        texcoords: null,
        elements: null,
    };

    const aniso = gl_ext.aniso;
    const textures = {
        color: load_texture('cimon-color.png', aniso),
        normal: load_texture('cimon-normal.png', aniso),
        gloss: load_texture('cimon-gloss.png', aniso),
        faces: load_face_textures(),
        envmap: load_cubemap_texture(),
    };

    let face_idx = 0;
    let next_face_time = 3000;

    function load_face_textures() {
        return Array.from('01234')
            .map(ch => load_texture(`cimon-screen-${ch}.png`));
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
        calc_mesh_tangents(obj);
        buffers.positions = create_buffer(gl.ARRAY_BUFFER, obj.positions);
        buffers.normals = create_buffer(gl.ARRAY_BUFFER, obj.normals);
        buffers.tangents = create_buffer(gl.ARRAY_BUFFER, obj.tangents);
        buffers.texcoords = create_buffer(gl.ARRAY_BUFFER, obj.texcoords);
        buffers.elements = create_buffer(gl.ELEMENT_ARRAY_BUFFER, obj.elements);
        num_verts = obj.n_vertices;
        num_elems = obj.n_elements;
        parts = obj.parts;
        //console.log(parts);
    }

    // temps
    const Q = quat.create();
    const Q2 = quat.create();
    const V = vec3.create();
    const M = mat3.create();
    const tmp = vec3.create();
    const mat_normal = mat3.create();

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

    function update_face() {
        if (!speech_playing)
            return;

        const now = performance.now();
        let time_ms = now - speech_started;

        let anim = face_anim.main;

        if (hours_until_overhead > 0) {
            // dynamic part
            if (time_ms >= speech_duration) {
                time_ms -= speech_duration;
                anim = face_anim.dynamic;
            }
        }

        const n_frames = anim.length;
        let curr_frame = Math.floor(time_ms / face_anim.interval_ms);
        curr_frame = clamp(curr_frame, 0, n_frames-1);
        face_idx = anim[curr_frame];
        //console.log(curr_frame, face_idx);
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

        update_face();

        // move to a random location
        const dt = env.dt / 1000;
        const dt2 = dt*dt;
        const pos = actor.pos;
        const pos0 = actor.pos0;
        const acc = actor.acc;

        if (1) {
            const t = 0.001 * env.time;
            // target pos
            vec3.set(V, 0.25 * noise(t, 0.0), 0.3 * noise(0.3, -t), 0.3);

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

        mat4.fromRotationTranslation(mat, actor.rot, actor.pos);
        mat3.normalFromMat4(mat_normal, mat);

        const pgm = program.use();
        pgm.uniformMatrix4fv('u_mat_viewproj', env.camera.mvp);
        pgm.uniformMatrix4fv('u_mat_model', mat);
        pgm.uniformMatrix3fv('u_mat_normal', mat_normal);
        pgm.uniform3fv('u_light_pos', env.light.pos);
        pgm.uniform3fv('u_view_pos', env.camera.view_pos);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positions);
        pgm.vertexAttribPointer('a_position', 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normals);
        pgm.vertexAttribPointer('a_normal', 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.tangents);
        pgm.vertexAttribPointer('a_tangent', 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoords);
        pgm.vertexAttribPointer('a_texcoord', 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.elements);

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);

        pgm.uniform4f('u_color', 0.5, 0.2, 0.1, 1.0);

        let start = 0;
        for (let i = 0; i < parts.length; ++i) {
            const part = parts[i];
            if (part.name == 'cimon_shell') {
                pgm.uniformSampler2D('u_tex_color', textures.color);
                pgm.uniformSampler2D('u_tex_normal', textures.normal);
                pgm.uniformSampler2D('u_tex_gloss', textures.gloss);
                pgm.uniformSamplerCube('u_tex_envmap', textures.envmap);
                pgm.uniform4f('u_shading_params', 0.4, 0.15, 0.7, 0);
                pgm.uniform1f('u_normal_mix', 1);
            }
            else if (part.name == 'cimon_face') {
                pgm.uniformSampler2D('u_tex_color', textures.faces[face_idx]);
                pgm.uniform4f('u_shading_params', 1.0, 0.2, 0.0, 0.5);
                pgm.uniform1f('u_normal_mix', 0);
            }

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
        if (speech_playing)
            return;

        sounds.vocal.play();

        let delay_to_end = sounds.vocal.duration();

        if (sounds_dynamic) {
            const delay = sounds.vocal.duration();
            sounds_dynamic.play(hours_until_overhead, delay);
            delay_to_end += 6.27;   // avg dynanimc len
        }

        setTimeout(function() {
            console.log('END OF SPEECH');
            speech_playing = false;

            if (end_callback)
                end_callback();
        }, ~~(1000 * delay_to_end));
    }

    /*
    document.addEventListener('keydown', e => {
        if (e.code !== 'Space')
            return;

        e.preventDefault();
    });
    */

    function kill() {
        console.log('cimon: kill. fade_and_stop_sounds');
        fade_and_stop_sounds(Object.values(sounds));
        sounds_dynamic.stop();
    }

    return {update, draw, add_force, hit_test, set_interest, start_speech, kill};
}

function make_program() {
    return create_program({
        name: 'cimon',
        vertex: GLSL`
            attribute vec3 a_position;
            attribute vec3 a_normal;
            attribute vec3 a_tangent;
            attribute vec2 a_texcoord;

            varying vec3 v_normal;
            varying vec3 v_tangent;
            varying vec2 v_texcoord;
            varying vec3 v_view_dir;

            // lighting
            varying vec3 v_light_dir;
            uniform vec3 u_light_pos;

            uniform mat4 u_mat_viewproj;
            uniform mat4 u_mat_model;
            uniform mat3 u_mat_normal;
            uniform vec3 u_view_pos;

            void main() {
                // worldspace position
                vec3 P_ws = (u_mat_model * vec4(a_position, 1.0)).xyz;

                // worldspace directions
                v_light_dir = u_light_pos - P_ws;
                v_view_dir = u_view_pos - P_ws;

                gl_Position = u_mat_viewproj * vec4(P_ws, 1.0);

                v_normal = u_mat_normal * a_normal;
                v_tangent = u_mat_normal * a_tangent;
                v_texcoord = a_texcoord;
            }
        `,
        fragment: GLSL`
            precision mediump float;

            varying vec3 v_normal;
            varying vec3 v_tangent;
            varying vec2 v_texcoord;
            varying vec3 v_light_dir;
            varying vec3 v_view_dir;

            uniform vec4 u_color;
            uniform sampler2D u_tex_color;
            uniform sampler2D u_tex_gloss;
            uniform sampler2D u_tex_normal;
            uniform samplerCube u_tex_envmap;
            uniform vec4 u_shading_params;
            uniform float u_normal_mix;

            float half_lambert(float NdotL) {
                float diff = 0.5 * (NdotL + 1.0);
                return diff * diff;
            }

            float saturate(float x) { return clamp(x, 0.0, 1.0); }
            vec3 saturate(vec3 x) { return clamp(x, 0.0, 1.0); }

            float specular_occlusion2(float NdotV, float occ) {
                return saturate(pow(NdotV + occ, 4.0) - 1.0 + occ);
            }

            vec3 filmic(vec3 c) {
                vec3 x = vec3(max(0.0, c.x-0.004), max(0.0, c.y-0.004), max(0.0, c.z-0.004));
                return (x*(6.2*x + 0.5)) / (x*(6.2*x + 1.7) + 0.06);
            }

            vec3 toLinear(vec3 rgb) {
                return pow(rgb, vec3(2.2));
            }

            void main() {
                float k_diffuse = u_shading_params[0];
                float k_specular = u_shading_params[1];
                float k_environment = u_shading_params[2];
                float k_emissive = u_shading_params[3];

                vec3 N = normalize(v_normal);
                vec3 T = normalize(v_tangent);
                vec3 V = normalize(v_view_dir);
                vec3 L = normalize(v_light_dir);
                vec3 H = normalize(L + V);
                vec3 R = reflect(V, N);

                float gloss = 1.0 - texture2D(u_tex_gloss, v_texcoord).g;
                /*
                {
                    gl_FragColor.rgb = texture2D(u_tex_gloss, v_texcoord).rgb;
                    gl_FragColor.a = 1.0;
                    return;
                }
                */

                {
                    // tangentspace -> worldspace
                    vec3 B = cross(N, T);
                    mat3 TBN = mat3(T, B, N);

                    vec3 N2 = 2.0 * (texture2D(u_tex_normal, v_texcoord).rgb - 0.5);
                    N = TBN * mix(vec3(0,0,1), N2, u_normal_mix);
                    N = normalize(N);
                }

                // accumulated radiance
                vec3 C = vec3(0.0);

                {
                    // color texture
                    C += toLinear(texture2D(u_tex_color, v_texcoord).rgb);
                }

                {
                    float NdotH = max(0.0, dot(N, H));
                    float NdotL = max(0.0, dot(N, L));
                    float NdotV = max(0.0, dot(N, V));

                    float diffuse = half_lambert(NdotL);
                    float specular = 0.0;

                    {
                        float phong_exponent = 30.0;
                        float phong_amount = k_specular;
                        specular += phong_amount * pow(min(1.0, NdotH), phong_exponent);
                    }

                    C *= (k_emissive + k_diffuse * diffuse);

                    vec3 Cs = vec3(0.0);
                    if (true) {
                        float f0 = 0.01;

                        float F0 = f0;
                        float NdotV = max(0.0, dot(N, V));
                        float F = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

                        float specular = k_environment;
                        float spec_occ = 0.5;
                        float x = saturate(F) * spec_occ * specular;
                        Cs += x * toLinear(textureCube(u_tex_envmap, R).rgb);
                    }

                    C += gloss * (Cs + vec3(specular));
                }

                C = filmic(C);
                gl_FragColor = vec4(C, 1.0);
            }
        `,
    });
}

function load_texture(path, aniso) {
    const texture = create_texture({
        size: 4,
        min: gl.LINEAR_MIPMAP_LINEAR,
        mag: gl.LINEAR,
    });

    if (aniso) {
        gl.texParameteri(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    }

    gl.generateMipmap(gl.TEXTURE_2D);

    assets.image(`textures/${path}`).then(img => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
    });

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

function calc_mesh_tangents(mesh) {
    let P = mesh.positions;
    let N = mesh.normals;
    let C = mesh.texcoords;
    let T = mesh.tangents || (mesh.tangents = new Float32Array(N.length));
    //let B = mesh.attributes.bitangents || (mesh.attributes.bitangents = new Float32Array(N.length));
    let E = mesh.elements;

    let p01 = vec3.create();
    let p02 = vec3.create();
    let c01 = vec2.create();
    let c02 = vec2.create();
    let sdir = vec3.create();
    //let tdir = vec3.create();

    let p0 = vec3.create();
    let p1 = vec3.create();
    let p2 = vec3.create();
    let c0 = vec2.create();
    let c1 = vec2.create();
    let c2 = vec2.create();

    function add_triangle(e0, e1, e2) {
        // load triangle position
        copy_vec3(p0, 0, P, 3*e0);
        copy_vec3(p1, 0, P, 3*e1);
        copy_vec3(p2, 0, P, 3*e2);

        // load triangle texcoord
        copy_vec2(c0, 0, C, 2*e0);
        copy_vec2(c1, 0, C, 2*e1);
        copy_vec2(c2, 0, C, 2*e2);

        // calc vectors
        vec3.sub(p01, p1, p0);
        vec3.sub(p02, p2, p0);

        vec2.sub(c01, c1, c0);
        vec2.sub(c02, c2, c0);

        // divisor
        let r = 1.0 / (c01[0]*c02[1] - c01[1]*c02[0]);

        sdir[0] = r * (p01[0]*c02[1] - p02[0]*c01[1]);
        sdir[1] = r * (p01[1]*c02[1] - p02[1]*c01[1]);
        sdir[2] = r * (p01[2]*c02[1] - p02[2]*c01[1]);

        //tdir[0] = r * (p02[0]*c02[0] - p01[0]*c01[0]);
        //tdir[1] = r * (p02[1]*c02[0] - p01[1]*c01[0]);
        //tdir[2] = r * (p02[2]*c02[0] - p01[2]*c01[0]);

        // accumulate
        for (let i = 0; i < 3; ++i) {
            T[3*e0 + i] += sdir[i];
            T[3*e1 + i] += sdir[i];
            T[3*e2 + i] += sdir[i];

            //B[3*e0 + i] += tdir[i];
            //B[3*e1 + i] += tdir[i];
            //B[3*e2 + i] += tdir[i];
        }
    }

    // reset
    zero_array(T);
    //zero_array(B);

    // accumulate
    let sp = 0;
    for (let i = 0; i < E.length; i += 3) {
        add_triangle(E[i+0], E[i+1], E[i+2]);
    }

    // Gram-Schmidt orthogonalize
    let nrm = vec3.create();
    let tan = vec3.create();
    //let bit = vec3.create();
    let tmp = vec3.create();

    for (let dp = 0; dp < T.length; dp += 3) {
        copy_vec3(nrm, 0, N, dp);
        copy_vec3(tan, 0, T, dp);
        //copy_vec3(bit, 0, B, dp);

        vec3.scale(tmp, nrm, vec3.dot(nrm, tan));
        vec3.sub(tmp, tan, tmp);
        vec3.normalize(tan, tmp);
        copy_vec3(T, dp, tan, 0);

        //vec3.normalize(bit, tmp);
        //copy_vec3(B, dp, bit, 0);
    }
}

function zero_array(arr) {
    let n = arr.length;
    for (let i = 0; i < n; ++i)
        arr[i] = 0.0;
}

function load_cubemap_texture() {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

    const size = 512;

    const sides = [
        gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
        gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
        gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X,
        gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
        gl.TEXTURE_CUBE_MAP_POSITIVE_Z
    ];

    //Array.from('bdflrt').forEach((ch, idx) => {
    Array.from('012345').forEach((ch, idx) => {
        // alloc
        const side = sides[idx];
        gl.texImage2D(side, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        // load
        assets.image(`textures/cimon-env-${ch}.png`).then(img => {
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
            gl.texImage2D(side, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
            //gl.generateMipmap(gl.TEXTURE_2D);
        });
    });

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
}
