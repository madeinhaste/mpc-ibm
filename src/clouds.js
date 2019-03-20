import {lerp, clamp, random_gaussian} from './utils';
import {create_buffer, create_program, create_texture, GLSL} from './webgl';

const num_clouds = 8192;
const clouds = new Float32Array(5 * num_clouds);
let clouds_start = 0;

let cloud_buffer;
let quad_buffer;
let wire_buffer;
let cloud_program;
let texture;
let texture_sky;

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

    texture_sky = create_texture({
        size: 256, min: gl.LINEAR, mag: gl.LINEAR,
    });

    {
        const img = new Image;
        img.src = './images/sky256.png';
        img.onload = _ => {
            gl.bindTexture(gl.TEXTURE_2D, texture_sky);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            //gl.generateMipmap(gl.TEXTURE_2D);
        };
    }

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
            uniform sampler2D u_texture_sky;
            uniform bool u_use_texture;
            uniform vec3 u_dircolor;
            uniform vec3 u_wire_color;

            void main() {
                /*
                float depth = gl_FragCoord.z / gl_FragCoord.w;
                float fogNear = 100.0;
                float fogFar = 300.0;
                float fogFactor = smoothstep( fogNear, fogFar, depth );
                //vec3 fogColor = vec3(.24,.376,.498);
                vec3 fogColor = vec3(0.777, 0.824, 0.897);

                gl_FragColor = texture2D( u_texture, v_coord );
                gl_FragColor.w *= pow( gl_FragCoord.z, 20.0 );
                gl_FragColor = mix( gl_FragColor, vec4( fogColor, gl_FragColor.w ), fogFactor );

                //gl_FragColor = vec4(fogFactor,0,0,1);
                //gl_FragColor.a *= (1.0 - v_fade);
                */
                vec4 C;
                vec3 fogColor = vec3(0.777, 0.824, 0.897);
                if (u_use_texture) {
                    C = texture2D(u_texture, v_coord);

                    //vec3 S = texture2D(u_texture_sky, v_coord).rgb;
                    //C.rgb += (C.a)*S*0.5;

                    C.a *= pow(v_fog, 1.0);
                    //C.rgb = mix(C.rgb, fogColor, C.a);

                    //C = vec4(v_fog*C.xyz*C.a, v_fog*C.a);
                    C.a *= (1.0 - v_fade);

                    {
                        //vec3 sun_col = vec3(1.5, 0.5, 0.2);
                        C.rgb *= v_ambcol;
                        C.rgb = mix(C.rgb, u_dircolor, clamp(v_dircol, 0.0, 1.0));
                    }

                } else {
                    //C = vec4(1, 1, 0, v_fog);
                    C = vec4(u_wire_color, 1.0);
                }
                //C.rgb = mix(C.rgb, vec3(0.8, 0.6, 0.7), 1.0-v_fade);
                //C.rgb = mix(C.rgb, vec3(1,0,0), v_fade);

                //C.a = 1.0;
                gl_FragColor = C;

                //gl_FragColor.rgb = vec3(v_dircol,0,0);
                //gl_FragColor.a = 1.0;
            }
        `,
    });
}

export function update_clouds(persp, init) {
    const zmax = persp.pos[2] - persp.zrange[0];
    const zmin = persp.pos[2] - persp.zrange[1];

    let dirty = false;
    let lastz = zmax;

    for (let i = 0; i < num_clouds; ++i) {
        const dp = 5 * i;

        const z = clouds[dp+2];

        if (z < lastz) {
            clouds_start = i;
        }
        lastz = z;

        if (!init && z < zmax) {
            continue;
        }

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

    if (dirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, cloud_buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, clouds);
    }
}

export function draw_clouds(persp, fog_range, ext, wire, params) {
    var pgm = cloud_program.use();
    pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
    pgm.uniformMatrix4fv('u_view', persp.view);
    //pgm.uniformMatrix3fv('bill', env.camera.bill);
    pgm.uniform2fv('u_fogrange', fog_range);
    pgm.uniformSampler2D('u_texture', texture);
    pgm.uniformSampler2D('u_texture_sky', texture_sky);
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
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const mode = wire ? gl.LINE_LOOP : gl.TRIANGLE_STRIP;

    const start = clouds_start;
    const count = num_clouds - start;
    //console.log(start);

    {
        pgm.uniform3f('u_wire_color', 1,1,0);
        const offset = 20 * start;
        gl.vertexAttribPointer(attr_position, 3, gl.FLOAT, false, 20, offset + 0);
        gl.vertexAttribPointer(attr_scale_rotate, 2, gl.FLOAT, false, 20, offset + 12);
        ext.drawArraysInstancedANGLE(mode, 0, 4, count);
    }

    {
        pgm.uniform3f('u_wire_color', 0,1,0);
        const offset = 0;
        gl.vertexAttribPointer(attr_position, 3, gl.FLOAT, false, 20, offset + 0);
        gl.vertexAttribPointer(attr_scale_rotate, 2, gl.FLOAT, false, 20, offset + 12);
        ext.drawArraysInstancedANGLE(mode, 0, 4, start);
    }

    ext.vertexAttribDivisorANGLE(attr_position, 0);
    ext.vertexAttribDivisorANGLE(attr_scale_rotate, 0);
}
