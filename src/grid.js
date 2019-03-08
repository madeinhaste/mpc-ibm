import {assert, lerp} from './utils';
import {create_buffer, create_program, create_texture, GLSL} from './webgl';
import {mat4} from 'gl-matrix';

export function init_grid(ext) {
    /*
    const v = [];
    const div = 100;
    for (let i = 0; i <= div; ++i) {
        const u = i / div;
        const x = lerp(-1, 1, u);
        v.push(-1, x, 1, x);
        v.push(x, -1, x, 1);
    }
    */

    const v = [0, 0, 1, 0, 0, 1, 1, 1];
    const n_verts = v.length/2;
    const buffer = create_buffer(gl.ARRAY_BUFFER, new Float32Array(v));
    const texture = make_texture(ext);
    const program = make_program();

    const mat = mat4.create();

    function update() {
    }

    function draw(env) {
        const pgm = program.use();

        mat4.identity(mat);
        mat4.rotateX(mat, mat, 0.5*Math.PI);
        mat4.mul(mat, env.camera.mvp, mat);

        pgm.uniformMatrix4fv('u_mvp', mat);
        pgm.uniform4f('u_color', 0.5, 0.8, 0.5, 1.0);
        pgm.uniform2f('u_scale', 10000, 10000);
        pgm.uniformSampler2D('u_texture', texture);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, n_verts);
        gl.disable(gl.BLEND);
    }

    return {update, draw};
}

function make_texture(ext) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const cw = c.width = c.height = 512;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, cw);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cw/2, cw/2, 20, 0, 2*Math.PI);
    ctx.fill();
    ctx.fillRect(0, ~~(cw/2), cw, 3);
    ctx.fillRect(~~(cw/2), 0, 3, cw);
    const tex = create_texture({
        size: cw,
        image: c,
        wrap: gl.REPEAT,
        min: gl.LINEAR_MIPMAP_LINEAR,
    });

    gl.texParameterf(gl.TEXTURE_2D, ext.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 16);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
}

function make_program() {
    return create_program({
        name: 'grid',
        vertex: GLSL`
            attribute vec2 a_coord;
            varying vec2 v_coord;
            uniform mat4 u_mvp;
            uniform vec2 u_scale;

            void main() {
                vec4 P = vec4(u_scale.x * (a_coord-0.5), 0.0, 1.0);
                gl_Position = u_mvp * P;
                v_coord = a_coord;
            }
        `,
        fragment: GLSL`
            precision highp float;
            varying vec2 v_coord;
            uniform vec4 u_color;
            uniform vec2 u_scale;
            uniform sampler2D u_texture;

            void main() {
                vec2 uv = u_scale.y * v_coord;
                gl_FragColor = u_color * texture2D(u_texture, uv);
            }
        `,
    });
}
