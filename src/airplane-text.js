import {create_buffer, create_program, create_texture, GLSL} from './webgl';

const script = [
    'The Weather Company offers solutions',
    'to help deliver real-time turbulence reports to pilots.',
    'So they can avoid specific weather patterns.',
    'Like lightning storms.',
    'There are an estimated 2,000 active electrical storms…',
    '…around the globe at any one time.',
    'Advance warnings create smoother flights.',
    'And can help reduce the risk…',
    '…of personal injury and asset damage.',
    'Saving airlines up to $100M in damages a year.',
    'Thanks to The Weather Company solutions,',
    'flights like this can avoid turbulence.',
];

const script_locations = [];

export function init_text() {
    //const canvas = document.querySelector('canvas.text');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const cw = canvas.width = 2048;
    const ch = canvas.height = 512;
    //ctx.scale(2, 2);

    const quad_buffer = create_buffer(gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 0, 1, 1, 1 ]));

    const textures = [];
    let script_location = 3;

    script.forEach(line => {
        const tex = create_texture({
            size: 4,
            //image: canvas,
            //flip: true,
            min: gl.LINEAR_MIPMAP_LINEAR,
            mag: gl.LINEAR,
        });
        gl.generateMipmap(gl.TEXTURE_2D);
        textures.push(tex);

        function render() {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, cw, ch);
            //ctx.clearRect(0, 0, cw, ch);

            const lines = line.split('\n');
            let tx = 0;
            let ty = 50;
            let th = 70;
            ctx.fillStyle = '#fff';
            ctx.font = '400 50px IBM Plex Sans';
            //ctx.shadowBlur = 20;
            //ctx.shadowColor = '#0ff';
            lines.forEach(line => {
                const line_w = ctx.measureText(line).width;
                tx = (cw - line_w)/2;
                ctx.fillText(line, tx, ty);
                ty += th;
            });

            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
            gl.generateMipmap(gl.TEXTURE_2D);
        }

        setTimeout(render, 500);

        script_locations.push(script_location);
        script_location += 1;
    });

    let text_program = create_program({
        name: 'text',
        vertex: GLSL`
            attribute vec2 a_coord;
            varying float v_fog;
            varying float v_fade;
            varying vec2 v_coord;
            uniform mat4 u_mvp;
            uniform mat4 u_view;
            uniform vec2 u_fogrange;
            uniform vec2 u_scale;
            uniform vec3 u_position;

            void main() {
                vec4 P;

                {
                    vec2 C = 2.0 * (a_coord - 0.5);
                    P.xyz = u_position + vec3(u_scale * C, 0.0);
                    P.w = 1.0;
                }

                {
                    float z = -(u_view * P).z;
                    float fog = 1.0 - clamp(
                        (z - u_fogrange[0]) / (u_fogrange[1] - u_fogrange[0]),
                        0.0,
                        1.0);
                    v_fog = pow(fog, 4.0);

                    // fade out clouds as the approach near plane
                    //v_fade = pow(fog, 5.0);
                    v_fade = smoothstep(1.00, 0.85, fog);
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
            uniform sampler2D u_texture;

            void main() {
                // white on black
                vec3 C = 1.0 - texture2D(u_texture, v_coord).rgb;

                // need to reduce white by fog/fade
                /*
                if (v_coord.x < 0.3333)
                    C = mix(vec3(1,0,0), vec3(0,1,0), v_fog);
                else if (v_coord.x < 0.6666)
                    C = mix(vec3(1,0,0), vec3(0,1,0), v_fade);
                else
                    C = mix(vec3(1,0,0), vec3(0,1,0), min(v_fog, v_fade));
                */

                /*
                vec3 C = 1.0 - v_fog * texture2D(u_texture, v_coord).rgb;
                C = mix(C, vec3(1), v_fade);

                if (C.g < 0.7) {
                    C.rb = vec2(0);
                }
                */

                C = mix(vec3(1,1,1), C, min(v_fog, v_fade));

                //C *= pow(v_fog, 1.0);
                //C *= (1.0 - v_fade);
                gl_FragColor = vec4(C, 1.0);
            }
        `,
    });
    
    function draw(env) {
        const persp = env.persp;
        const pgm = text_program.use();
        pgm.uniformMatrix4fv('u_mvp', persp.viewproj);
        pgm.uniformMatrix4fv('u_view', persp.view);
        pgm.uniform2fv('u_fogrange', env.fog_range);

        const s = 10.0;
        pgm.uniform2f('u_scale', s, 0.25*s);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad_buffer);
        pgm.vertexAttribPointer('a_coord', 2, gl.FLOAT, false, 0, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.DST_COLOR, gl.ZERO);

        const cps = env.points;
        const n_lines = script.length;
        for (let i = 0; i < n_lines; ++i) {
            const location = script_locations[i];
            const sp = 3 * (location - env.points_start);
            if (sp > cps.length-3)
                continue;

            const texture = textures[i];
            pgm.uniformSampler2D('u_texture', texture);
            pgm.uniform3f('u_position', cps[sp+0], cps[sp+1], cps[sp+2]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        gl.disable(gl.BLEND);
    }

    return {
        draw,
    };
}
