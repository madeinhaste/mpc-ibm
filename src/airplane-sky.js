import {mat3, mat4} from 'gl-matrix';
import {create_buffer, create_program, create_texture, GLSL} from './webgl';
import {assets} from './airplane-common';

export function init_sky() {
    const sky_program = make_sky_program();
    const sky_textures = [];
    const buf_fstri = create_buffer(gl.ARRAY_BUFFER, new Float32Array([ -1, -1, 3, -1, -1, 3 ]));

    const proj_inv = mat4.create();
    const view_inv = mat3.create();

    {
        // load sky textures
        const max_texture_size = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        const size = (max_texture_size >= 8192) ? '8k' : '4k';

        const filenames = [
            `airplane-env-clear-${size}.jpg`,
            `airplane-env-storm-${size}.jpg`,
        ];

        filenames.forEach(filename => {
            const tex = create_texture({ size: 128, min: gl.LINEAR, mag: gl.LINEAR });
            sky_textures.push(tex);
            assets.image(`textures/${filename}`).then(img => {
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            });
        });
    }

    function draw(env) {
        const pgm = sky_program.use();

        {
            // http://marcinignac.com/blog/pragmatic-pbr-hdr/
            // https://www.saschawillems.de/?page_id=2122
            // https://rauwendaal.net/2014/06/14/rendering-a-screen-covering-triangle-in-opengl/
            const v = env.persp.view;
            const b = view_inv;
            b[0] = v[0]; b[1] = v[4]; b[2] = v[8];
            b[3] = v[1]; b[4] = v[5]; b[5] = v[9];
            b[6] = v[2]; b[7] = v[6]; b[8] = v[10];
            mat4.invert(proj_inv, env.persp.proj);
        }

        pgm.uniformMatrix4fv('u_proj_inv', proj_inv);
        pgm.uniformMatrix3fv('u_view_inv', view_inv);

        pgm.uniformSampler2D('u_texture0', sky_textures[0]);
        pgm.uniformSampler2D('u_texture1', sky_textures[1]);
        pgm.uniform2f('u_resolution', env.canvas.width, env.canvas.height);
        pgm.uniform1f('u_rotate', env.params.sky_rotate);
        pgm.uniform1f('u_crossfade', env.params.sky_blend);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf_fstri);
        pgm.vertexAttribPointer('a_position', 2, gl.FLOAT, false, 0, 0);
        gl.disable(gl.CULL_FACE);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function kill() {
    }

    function make_sky_program() {
        return create_program({
            name: 'sky',
            vertex: GLSL`
            attribute vec2 a_position;
            varying vec3 v_dir;

            uniform mat4 u_proj_inv;
            uniform mat3 u_view_inv;

            void main() {
                vec4 P = vec4(a_position, 0.0, 1.0);

                {
                    v_dir = u_view_inv * (u_proj_inv * P).xyz;
                }

                gl_Position = P;
            }
            `,
            fragment: GLSL`
            precision mediump float;
            varying vec3 v_dir;
            uniform sampler2D u_texture0;
            uniform sampler2D u_texture1;
            uniform vec2 u_resolution;
            uniform float u_rotate;
            uniform float u_crossfade;

            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233)))*43758.5453123);
            }

            void main() {
                vec3 dir = normalize(v_dir);
                vec2 uv = vec2(
                    (atan(dir.z, dir.x) / 6.283185307179586476925286766559) + 0.5,
                    acos(dir.y) / 3.1415926535897932384626433832795);
                uv.x = fract(uv.x + u_rotate);

                vec3 C = mix(
                    texture2D(u_texture0, uv).rgb,
                    texture2D(u_texture1, uv).rgb,
                    u_crossfade);

                gl_FragColor = vec4(C, 1.0);
            }
            `,
        });
    }

    return {draw, kill};
}
