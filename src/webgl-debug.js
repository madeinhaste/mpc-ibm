import {each_line, HTML} from './utils';

export function dump_glsl_error(name, error) {
    error.name = name;

    let errors = {};
    each_line(error.log, function(e, i) {
        let match = e.match(/^ERROR: \d+:(\d+):(.*)$/);
        if (match) {
            let line = parseInt(match[1]);
            let desc = match[2];

            if (!errors[line])
                errors[line] = [];

            errors[line].push(desc);
        }
    });

    let html;
    switch (error.error) {
        case 'shader_compile_error':
            html = "<div class=\"webgl-error-info\">GLSL compile error in " + (error.type.toLowerCase()) + " shader \"" + error.name + "\":</div>";

            each_line(error.source, function(line, index) {
                var descs = errors[index+1];
                if (descs) {
                    descs = descs.map(desc => {
                        return "<div class='webgl-error-info'>" + desc + "</div>";
                    }).join('');

                    html += "<span class='webgl-error-highlight'>" + line + "</span> " + descs;
                }
                else
                {
                    html += line + '\n';
                }
            });

            break;

        case 'program_link_error':
            html = "<div class=\"webgl-error-info\">GLSL link error in program \"" + error.name + "\":<br/>\n" + error.log + "\n</div>";
            break;
    }

    const el = HTML`<div class=webgl-error></div>`;
    el.innerHTML = html;
    document.body.appendChild(el);
}
