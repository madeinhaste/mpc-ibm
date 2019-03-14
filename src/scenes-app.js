import './reloader';
import './qrcode-overlay';
import {init_rotation_sensor} from './rotation-sensor';
import H from './hyperHTML';
import {assert, each_line, resize_canvas_to_client_size} from './utils';
import {init_scenes, format_timecode} from './scenes';

const scenes = init_scenes();
const canvas = H`<canvas class=timeline/>`;
const ctx = canvas.getContext('2d');

H(document.body)`
<div class=layout>
    <div class=video-container>
        ${scenes.video}
        ${Subtitle()}
        ${Timecode()}
    </div>
    ${canvas}
</div>
${Debug()}
`;

start();

function Debug(text) {
    return H(Debug)`<div class=debug>${text}</div>`;
}

function Subtitle(text) {
    if (text) {
        text = text
            .replace('[', '<em>')
            .replace(']', '</em>');
        text = [text];
    }

    return H(Subtitle)`<div class=subtitle>${text}</div>`;
}

function Timecode() {
    return H(Timecode)`<div class=timecode>${
        format_timecode(scenes.video.currentTime, 24)
    }</div>`;
}

function animate() {
    requestAnimationFrame(animate);
    update();
    render_timeline();
}

function update() {
    if (scenes.update())
        Subtitle(scenes.current_text);

    Timecode();
}

async function start() {
    await scenes.ready();
    render_timeline();
    scenes.video.play();
    animate();
}

function render_timeline() {
    const video = scenes.video;
    const timeline = scenes.timeline;

    // render timeline
    resize_canvas_to_client_size(canvas, true);
    const cw = canvas.width;
    const ch = canvas.height;
    const dx = cw / video.duration;

    {
        // background
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, cw, ch);
    }

    {
        // scenes
        ctx.lineWidth = 1;
        for (let i = 0; i < timeline.length; i += 2) {
            const t0 = timeline[i].time;
            const t1 = timeline[i+1].time;
            const text = timeline[i].text;
            assert(text);
            const x0 = Math.floor(dx * t0);
            const x1 = Math.floor(dx * t1);
            ctx.fillStyle = '#745';
            ctx.fillRect(x0, 0, x1-x0, ch);
            ctx.fillStyle = 'rgba(0,0,0, 0.5)';
            ctx.fillRect(x0, 0, 1, ch);
        }
    }

    {
        // bevel
        ctx.fillStyle = 'rgba(0,0,0, 0.5)';
        ctx.fillRect(0,0,cw,1);
        ctx.fillRect(0,ch-1,cw,1);
    }

    {
        // playhead
        ctx.fillStyle = '#c80';
        const t = video.currentTime;
        const x = Math.floor(dx * t);
        ctx.fillRect(x, 0, 3, ch);
    }
}

let dragging = false;

canvas.onmousedown = e => {
    if (e.button === 0) {
        dragging = true;
        scrub_to_input_event(e);
        e.preventDefault();
    }
};

document.addEventListener('mousemove', e => {
    if (dragging) {
        scrub_to_input_event(e);
        e.preventDefault();
    }
});

document.addEventListener('mouseup', e => {
    if (dragging) {
        scrub_to_input_event(e);
        dragging = false;
        e.preventDefault();
    }
});

document.addEventListener('keydown', e => {
    switch (e.code) {
        case 'Space':
            scenes.toggle_playback();
            break;
        case 'KeyM':
            scenes.toggle_muted();
            break;
        case 'Home':
            scenes.video.currentTime = 0;
            break;
        case 'ArrowLeft':
            scenes.jump_to_next_marker(-1);
            break;
        case 'ArrowRight':
            scenes.jump_to_next_marker(1);
            break;
        default:
            return;
    }

    e.preventDefault();
});

function scrub_to_input_event(e) {
    const video = scenes.video;
    const cw = canvas.width;
    const x = e.offsetX;
    const t = video.duration * (x / cw);
    video.currentTime = t;
}
