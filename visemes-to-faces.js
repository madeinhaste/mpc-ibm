const fs = require('fs');
const filepath = process.argv[2];

const text = fs.readFileSync(filepath, 'utf8');
const face_idxs = [];
each_line(text, line => {
    const v = line.split('; ').map(parseFloat);
    face_idxs.push(visemes_to_face(v));
});

console.log(JSON.stringify(face_idxs));

function each_line(text, callback) {
    var sp = 0;
    var lineno = 0;
    while (sp < text.length) {
        var ep = text.indexOf('\n', sp);
        if (ep == -1)
            ep = text.length;

        var line = text.substr(sp, ep - sp);
        sp = ep + 1;

        callback(line, lineno++);
    }
}

function visemes_to_face(visemes) {
    console.assert(visemes.length == 15);

    let max_idx = 0;
    let max_val = 0;
    for (let i = 0; i < 15; ++i) {
        const value = visemes[i];
        if (value > max_val) {
            max_val = value;
            max_idx = i;
        }
    }

    let face_idx;
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
    }

    return face_idx;
}
