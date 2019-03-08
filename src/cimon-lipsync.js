import './reloader';
import {assert, lerp, clamp, resize_canvas_to_client_size, redraw_func, $, each_line} from './utils';
import {Howl, Howler} from 'howler';

const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const debug = function() {
    const el = $('.debug');
    return s => {
        el.innerHTML = s;
    };
}();

const audio = $('audio');

const images = Array.from('abcde').map(ch => {
    const image = new Image;
    image.src = `images/cimon/faces/screenface_${ch}.png`;
    return image;
});

// 0 a: smile
// 1 b: talking
// 2 c: smile + eyes closed
// 3 d: talking + wink
// 4 e: neutral

let visemes = null;

const viseme_names = [
  "sil", "PP", "FF", "TH", "DD",
  "kk", "CH", "SS", "nn", "RR",
  "aa", "E", "ih", "oh", "ou",
];

(function() {
    fetch('data/cimon-visemes.txt')
        .then(r => r.text())
        .then(text => {
            const data = [];
            each_line(text, line => {
                data.push.apply(data,
                    line.split('; ')
                        .map(parseFloat));
            });
            return new Float32Array(data);
        })
        .then(data => {
            visemes = data;
            console.log('got visemes:', data.length/15);
        });
}());

let image_idx = 0;
let next_image_time = 1000;
let curr_frame = 0;
let max_idx = 0;

function draw() {
    resize_canvas_to_client_size(canvas, false);
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const image = images[image_idx];
    ctx.drawImage(image, 0, 0, cw, ch);

    // draw visemes
    if (visemes) {
        let sp = 15 * curr_frame;
        ctx.fillStyle = '#c00';
        ctx.font = '13px "IBM Plex Sans"';
        ctx.textAlign = 'center';
        for (let i = 0; i < 15; ++i) {
            const value = visemes[sp + i];
            const x0 = ~~(i * cw / 15);
            const w = ~~(cw / 15);
            const h = Math.round(value * 100);
            ctx.fillStyle = (i === max_idx) ? '#0c0' : '#c00';
            ctx.fillRect(x0, ch - h, w, h);

            const name = viseme_names[i];
            ctx.fillStyle = '#000';
            ctx.fillText(name, x0 + w/2, ch - 4);
        }
    }
}

function update() {
    if (visemes) {
        const n_frames = visemes.length / 15;
        curr_frame = clamp(Math.round(audio.currentTime * 100), 0, n_frames - 1);

        //let max_idx = 0;
        let max_val = 0;
        let sp = 15 * curr_frame;
        for (let i = 0; i < 15; ++i) {
            const value = visemes[sp + i];
            if (value > max_val) {
                max_val = value;
                max_idx = i;
            }
        }

        debug(max_idx);
    } else {
        curr_frame = 0;
    }

    switch (max_idx) {
    case 0:
        image_idx = 4;
        break;
    case 1: case 4: case 7:
        image_idx = 0;
        break;
    case 2: case 5: case 8: case 11:
        image_idx = 2;
        break;
    case 3: case 6: case 9: case 12:
        image_idx = 3;
        break;
    case 10: case 13: case 14:
        image_idx = 1;
        break;
    }

    /*
    const now = performance.now();
    if (now > next_image_time) {
        image_idx = ~~(images.length * Math.random());
        next_image_time = now + 1000;
        //debug(image_idx);
    }
    */
}

function animate() {
    requestAnimationFrame(animate);
    update();
    draw();
}

animate();

document.onkeydown = e => {
    if (e.code == 'Space') {
        // whatever
        if (audio.paused) {
            audio.currentTime = 0;
            audio.play();
        } else {
            audio.currentTime = 0;
            audio.pause();
        }
        e.preventDefault();
    }
};
