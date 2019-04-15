import {lerp, clamp, random_gaussian} from './utils';
import {create_buffer, create_program, create_texture, RenderTexture, GLSL} from './webgl';
import {assets} from './airplane-common';

const num_clouds = 8192;
const clouds = new Float32Array(5 * num_clouds);
let clouds_start = 0;

let cloud_buffer;
let quad_buffer;
let wire_buffer;
let cloud_program;
let blit_program;
let texture;
let render_texture;
let use_render_texture = false;
//let texture_sky;

export function init_clouds() {
    cloud_buffer = create_buffer(gl.ARRAY_BUFFER, clouds);
    quad_buffer = create_buffer(gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 0, 1, 1, 1 ]));
    wire_buffer = create_buffer(gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 1, 1, 0, 1 ]));

    texture = create_texture({
        size: 256,
        min: gl.LINEAR_MIPMAP_LINEAR,
        mag: gl.LINEAR,
    });
    gl.generateMipmap(gl.TEXTURE_2D);

    render_texture = new RenderTexture(128, 128, false, false);

    assets.image('textures/airplane-cloud.png').then(img => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
    });

    cloud_program = create_program({
        name: 'cloud',
        vertex: GLSL`
            attribute vec2 a_coord;
            attribute vec3 a_position;
            attribute vec2 a_scale_rotate;
            uniform vec2 u_scale_rotate;
            varying float v_fog;
            varying float v_fade;
            varying vec2 v_coord;
            varying float v_dircol;
            varying float v_ambcol;
            uniform mat4 u_mvp;
            uniform mat4 u_view;
            uniform vec2 u_fogrange;
            uniform float u_ambshade;

            void main() {
                vec4 P;

                {
                    vec2 C = 2.0 * (a_coord - 0.5);

                    {
                        float scale = u_scale_rotate.x * a_scale_rotate.x;
                        float rotate = u_scale_rotate.y * a_scale_rotate.y;
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

                    // fade out clouds as the approach near plane
                    v_fade = pow(fog, 100.0);
                }

                {
                    // directional sun color
                    vec3 sun_pos = vec3(-300, 100, -500);
                    vec3 v1 = normalize(sun_pos - a_position);
                    vec3 v2 = normalize(P.xyz - a_position);
                    float d = dot(v1, v2);
                    v_dircol = d;

                    // ambient height
                    v_ambcol = mix(u_ambshade, 1.0, smoothstep(-5.0, 1.0, P.y));
                }

                gl_Position = u_mvp * P;
                v_coord = a_coord;
            }
        `,
        fragment: GLSL`
            precision highp float;
            varying float v_fog;
            varying vec2 v_coord;
            varying float v_fade;
            varying float v_dircol;
            varying float v_ambcol;
            uniform sampler2D u_texture;
            uniform bool u_use_texture;
            uniform vec3 u_dircolor;
            uniform vec3 u_wire_color;

            void main() {
                vec4 C;
                vec3 fogColor = vec3(0.777, 0.824, 0.897);
                if (u_use_texture) {
                    C = texture2D(u_texture, v_coord);

                    //C.rgb *= C.a;
                    //C.a *= 0.5;

                    C.a *= pow(v_fog, 1.0);
                    C.a *= (1.0 - v_fade);

                    if (true) {
                        C.rgb *= v_ambcol;
                        C.rgb = mix(C.rgb, u_dircolor, clamp(v_dircol, 0.0, 1.0));
                        //C.rgb = vec3(0.01);
                    }

                    C.rgb *= C.a;

                    if (false) {
                        vec2 P = (v_coord - 0.5) * 2.0;
                        float d = 1.0 - dot(P, P);
                        d = clamp(d, 0.0, 1.0);

                        C = vec4(1.0, 0.0, 0.0, d);
                    }

                } else {
                    C = vec4(u_wire_color, 1.0);
                }
                gl_FragColor = C;
            }
        `,
    });

    blit_program = create_program({
        name: 'cloud-blit',
        vertex: GLSL`
            attribute vec2 a_coord;
            varying vec2 v_coord;

            void main() {
                vec2 P = (a_coord - 0.5) * 2.0;
                gl_Position = vec4(P, 0.0, 1.0);
                v_coord = a_coord;
            }
        `,
        fragment: GLSL`
            precision mediump float;
            varying vec2 v_coord;
            uniform sampler2D u_texture;

            void main() {
                vec4 C = texture2D(u_texture, v_coord).rgba;
                //gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
                //gl_FragColor = vec4(C.a, 0.0, 0.0, 1.0);
                gl_FragColor = C;
            }
        `,
    });
}

export function update_clouds(persp, init) {
    const zmax = persp.pos[2] - persp.zrange[0];
    const zmin = persp.pos[2] - persp.zrange[1];

    // zmax: near
    // zmin: far

    let dirty = false;
    let lastz = zmax;

    for (let i = 0; i < num_clouds; ++i) {
        const dp = 5 * i;
        const z = clouds[dp+2];

        if (!init && z < zmax) {
            continue;
        }

        // z is >= zmax, ie in front of the near plane
        // so respawn at the far plane

        // position x, y
        clouds[dp + 0] = persp.pos[0] + 100 * (lerp(-1, 1, Math.random()) + random_gaussian(0, 0.3));
        clouds[dp + 1] = random_gaussian(0, 5);

        // position z
        if (init)
            clouds[dp + 2] = lerp(zmin, zmax, i/num_clouds);
        else
            clouds[dp + 2] -= (zmax - zmin);

        // scale
        clouds[dp + 3] = (Math.random() * Math.random() * 1.5 + 0.5) * 3;
        // rotate
        clouds[dp + 4] = Math.random() * 2 * Math.PI;

        dirty = true;
    }

    for (let i = 0; i < num_clouds; ++i) {
        const dp = 5 * i;
        const z = clouds[dp+2];
        if (z < lastz) {
            clouds_start = i;
        }
        lastz = z;
    }

    if (dirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, cloud_buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, clouds);
    }
}

export function draw_clouds(persp, fog_range, ext, wire, params, cw, ch) {
    //use_render_texture = params.cloud_rt;
    use_render_texture = params.cloud_resolution < 1;

    var pgm = cloud_program.use();
    pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
    pgm.uniformMatrix4fv('u_view', persp.view);
    pgm.uniform2fv('u_fogrange', fog_range);
    pgm.uniformSampler2D('u_texture', texture);
    pgm.uniform1i('u_use_texture', wire ? 0 : 1);

    {
        const c = params.sun_color;
        const s = params.sun_strength/255;
        pgm.uniform3f('u_dircolor', s*c[0], s*c[1], s*c[2]);
        pgm.uniform1f('u_ambshade', 1-params.ambient_shading);
        pgm.uniform2f('u_scale_rotate', params.cloud_scale, params.cloud_rotate);
    }

    // non-instanced attrib
    gl.bindBuffer(gl.ARRAY_BUFFER, wire ? wire_buffer : quad_buffer);
    const attr_coord = pgm.enableVertexAttribArray('a_coord');
    ext.vertexAttribDivisorANGLE(attr_coord, 0);
    gl.vertexAttribPointer(attr_coord, 2, gl.FLOAT, false, 0, 0);

    // instanced attribs
    gl.bindBuffer(gl.ARRAY_BUFFER, cloud_buffer);
    const attr_position = pgm.enableVertexAttribArray('a_position');
    ext.vertexAttribDivisorANGLE(attr_position, 1);

    const attr_scale_rotate = pgm.enableVertexAttribArray('a_scale_rotate');
    ext.vertexAttribDivisorANGLE(attr_scale_rotate, 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    /*
    gl.blendFuncSeparate(
        gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        */

    const mode = wire ? gl.LINE_LOOP : gl.TRIANGLE_STRIP;

    const start = clouds_start;
    const count = num_clouds - start;

    if (use_render_texture) {
        const r = params.cloud_resolution;
        const tw = Math.max(128, r * cw);
        const th = Math.max(128, r * ch);
        render_texture.resize(tw, th);
        render_texture.push();
        //gl.clearColor(1,0,0,0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    if (1) {
        pgm.uniform3f('u_wire_color', 1,1,0);
        const offset = 20 * start;
        gl.vertexAttribPointer(attr_position, 3, gl.FLOAT, false, 20, offset + 0);
        gl.vertexAttribPointer(attr_scale_rotate, 2, gl.FLOAT, false, 20, offset + 12);
        ext.drawArraysInstancedANGLE(mode, 0, 4, count);
    }

    if (1) {
        pgm.uniform3f('u_wire_color', 0,1,0);
        const offset = 0;
        gl.vertexAttribPointer(attr_position, 3, gl.FLOAT, false, 20, offset + 0);
        gl.vertexAttribPointer(attr_scale_rotate, 2, gl.FLOAT, false, 20, offset + 12);
        ext.drawArraysInstancedANGLE(mode, 0, 4, start);
    }

    ext.vertexAttribDivisorANGLE(attr_position, 0);
    ext.vertexAttribDivisorANGLE(attr_scale_rotate, 0);

    if (use_render_texture) {
        render_texture.pop();

        const pgm = blit_program.use();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad_buffer);
        pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);
        pgm.uniformSampler2D('u_texture', render_texture.texture);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        /*
        gl.blendFuncSeparate(
            gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, 
            gl.ONE, gl.ZERO);
            */
        //gl.disable(gl.BLEND);
        //gl.colorMask(true, true, true, false);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        //gl.colorMask(true, true, true, true);
        gl.disable(gl.BLEND);
    }
}
