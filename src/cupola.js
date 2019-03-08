import {create_buffer, create_program, create_texture, GLSL} from './webgl';
import {mat4, vec3, quat} from 'gl-matrix';

export function init_cupola() {
    const quad_buffer = create_buffer(
        gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 0, 1, 1, 1 ]));

    const textures = {
        cupola_0: load_texture('images/cimon/cupola-0.png'),
        cupola_1: load_texture('images/cimon/cupola-1.png'),
        earthrise: load_texture('images/cimon/earthrise.jpg'),
    };

    const program = make_program();
    const mat = mat4.create();

    function update() {
    }

    function draw(env) {
        const pgm = program.use();
        pgm.uniformMatrix4fv('u_mvp', env.camera.mvp);

        gl.bindBuffer(gl.ARRAY_BUFFER, quad_buffer);
        pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);

        mat4.identity(mat);
        mat[0] = mat[5] = mat[10] = 1.25;
        mat[14] = -1;
        //mat4.translate(mat, mat, [0,0, 1]);
        pgm.uniformMatrix4fv('u_mat', mat);
        pgm.uniformSampler2D('u_texture', textures.earthrise);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        {
            const angle = 0.000050 * env.time;
            mat4.identity(mat);
            mat[0] = mat[5] = mat[10] = 1.00;
            mat4.rotateZ(mat, mat, angle);
            pgm.uniformMatrix4fv('u_mat', mat);

            gl.enable(gl.BLEND);
            pgm.uniformSampler2D('u_texture', textures.cupola_0);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            pgm.uniformSampler2D('u_texture', textures.cupola_1);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.disable(gl.BLEND);
        }
    }

    return {update, draw};
}

function make_program() {
    return create_program({
        name: 'cupola',
        vertex: GLSL`
            attribute vec2 a_coord;
            varying vec2 v_texcoord;
            uniform mat4 u_mvp;
            uniform mat4 u_mat;

            void main() {
                gl_Position = u_mvp * u_mat * vec4(2.0*(a_coord - 0.5), 0.0, 1.0);
                v_texcoord = a_coord;
            }
        `,
        fragment: GLSL`
            precision mediump float;
            varying vec2 v_texcoord;
            uniform sampler2D u_texture;

            void main() {
                vec4 C = texture2D(u_texture, v_texcoord);
                gl_FragColor = C;
            }
        `,
    });
}

function load_texture(url) {
    const texture = create_texture({ size: 4, filter: gl.LINEAR });

    const img = new Image;
    img.src = url;
    img.onload = _ => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };

    return texture;
}
