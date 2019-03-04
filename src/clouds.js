import {lerp, clamp, random_gaussian} from './utils';
import {create_buffer, create_program, create_texture, GLSL} from './webgl';

const num_clouds = 1024;
const clouds = new Float32Array(5 * num_clouds);

let cloud_buffer;
let quad_buffer;
let wire_buffer;
let cloud_program;
let texture;

export function init_clouds() {
    cloud_buffer = create_buffer(gl.ARRAY_BUFFER, clouds);
    quad_buffer = create_buffer(gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 0, 1, 1, 1 ]));
    wire_buffer = create_buffer(gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 1, 1, 0, 1 ]));

    texture = create_texture({
        size: 256,
        min: gl.LINEAR_MIPMAP_LINEAR,
        mag: gl.LINEAR,
    });

    {
        const img = new Image;
        img.src = './images/cloud10.png';
        img.onload = _ => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
        };
    }

    cloud_program = create_program({
        name: 'cloud',
        vertex: GLSL`
            attribute vec2 a_coord;
            attribute vec3 a_position;
            attribute vec2 a_scale_rotate;
            varying float v_fog;
            varying vec2 v_coord;
            uniform mat4 u_mvp;
            uniform mat4 u_view;
            uniform vec2 u_fogrange;

            void main() {
                vec4 P;

                {
                    vec2 C = 2.0 * (a_coord - 0.5);

                    {
                        float scale = a_scale_rotate.x;
                        float rotate = a_scale_rotate.y;
                        float c = scale * cos(rotate);
                        float s = scale * sin(rotate);
                        mat2 M = mat2(c, s, -s, c);
                        C = M * C;
                    }

                    P.xyz = a_position + vec3(C, 0.0);
                    P.w = 1.0;
                }

                {
                    float z = -(u_view * P).z;
                    float fog = 1.0 - clamp(
                        (z - u_fogrange[0]) / (u_fogrange[1] - u_fogrange[0]),
                        0.0,
                        1.0);
                    v_fog = fog * fog;
                }

                gl_Position = u_mvp * P;
                v_coord = a_coord;
            }
        `,
        fragment: GLSL`
            precision highp float;
            varying float v_fog;
            varying vec2 v_coord;
            uniform sampler2D u_texture;
            uniform bool u_use_texture;

            void main() {
                vec4 C;
                if (u_use_texture) {
                    C = texture2D(u_texture, v_coord);
                    C.a *= v_fog;
                } else {
                    C = vec4(1, 1, 0, v_fog);
                }
                gl_FragColor = C;
            }
        `,
    });
}

export function update_clouds(persp, init) {
    const zmax = persp.pos[2] - persp.zrange[0];
    const zmin = persp.pos[2] - persp.zrange[1];

    let dirty = false;
    for (let i = 0; i < num_clouds; ++i) {
        const dp = 5 * i;

        if (!init && (clouds[dp+2] < zmax))
            continue;

        // position x, y
        clouds[dp + 0] = 100 * lerp(-1, 1, Math.random());
        clouds[dp + 1] = 2 * lerp(-1, 1, Math.random());

        // position z
        if (init)
            clouds[dp + 2] = lerp(zmin, zmax, i/num_clouds);
        else
            clouds[dp + 2] = zmin;

        // scale
        clouds[dp + 3] = (Math.random() * Math.random() * 1.5 + 0.5) * 3;
        // rotate
        clouds[dp + 4] = Math.random() * 2 * Math.PI;

        dirty = true;
    }

    if (dirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, cloud_buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, clouds);
    }
}

export function draw_clouds(persp, fog_range, ext, wire) {
    var pgm = cloud_program.use();
    pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
    pgm.uniformMatrix4fv('u_view', persp.view);
    //pgm.uniformMatrix3fv('bill', env.camera.bill);
    pgm.uniform2fv('u_fogrange', fog_range);
    pgm.uniformSampler2D('u_texture', texture);
    pgm.uniform1i('u_use_texture', wire ? 0 : 1);

    // non-instanced attrib
    gl.bindBuffer(gl.ARRAY_BUFFER, wire ? wire_buffer : quad_buffer);
    pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);

    // instanced attrib
    gl.bindBuffer(gl.ARRAY_BUFFER, cloud_buffer);
    const attr_position = pgm.enableVertexAttribArray('a_position');
    ext.vertexAttribDivisorANGLE(attr_position, 1);
    gl.vertexAttribPointer(attr_position, 3, gl.FLOAT, false, 20, 0);

    const attr_scale_rotate = pgm.enableVertexAttribArray('a_scale_rotate');
    ext.vertexAttribDivisorANGLE(attr_scale_rotate, 1);
    gl.vertexAttribPointer(attr_scale_rotate, 2, gl.FLOAT, false, 20, 12);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    ext.drawArraysInstancedANGLE(wire ? gl.LINE_LOOP : gl.TRIANGLE_STRIP, 0, 4, num_clouds);

    ext.vertexAttribDivisorANGLE(attr_position, 0);
    ext.vertexAttribDivisorANGLE(attr_scale_rotate, 0);
}
