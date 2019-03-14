import './reloader';
import './qrcode-overlay';
import {init_rotation_sensor} from './rotation-sensor';
import H from './hyperHTML';
import {assert, each_line, resize_canvas_to_client_size} from './utils';

const video = H`
<video muted>
    <source src=videos/smartscenes-190313.mp4 type=video/mp4>
</video>`;

function await_video_metadata() {
    return new Promise((res, rej) => {
        video.onloadedmetadata = res;
    });
}

let timeline = null;
let timeline_idx = -1;

const canvas = H`<canvas class=timeline/>`;
const ctx = canvas.getContext('2d');

H(document.body)`
<div class=layout>
    <div class=video-container>
        ${video}
        ${Subtitle()}
    </div>
    ${canvas}
</div>
${Debug()}
`;

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

function animate() {
    requestAnimationFrame(animate);
    update();
    render_timeline();
}
//animate();

function update_timeline_idx() {
    const t = video.currentTime;
    let idx = -1;
    for (let i = 0; i < timeline.length; ++i) {
        if (timeline[i].time >= t)
            break;
        idx = i;
    }

    if (idx === timeline_idx)
        return false;

    timeline_idx = idx;
    return true;
}

function update() {
    if (!update_timeline_idx())
        return;
    
    if (timeline_idx < 0) {
        Subtitle(null);
    } else {
        const text = timeline[timeline_idx].text;
        Subtitle(text);
    }
}

async function init_timeline() {
    const rsp = await fetch('data/smartscenes-timecodes.txt');
    const text = await rsp.text();

    const markers = [];
    const scripts = [];

    each_line(text, (line, idx) => {
        if (idx & 1) {
            // scripts
            scripts.push(line, null);
        } else {
            // markers
            const [min, mout] = line
                .split(' ')
                .map(s => parse_timecode(s, 24));
            //.map(s => format_timecode(s, 24));
            markers.push(min, mout)
        }
    });

    timeline = markers.map((t, idx) => ({
        time: t,
        text: scripts[idx],
    }));
}

(async function() {
    await Promise.all([
        init_timeline(),
        await_video_metadata(),
    ]);
    render_timeline();
    video.play();
    animate();
})();

function render_timeline() {
    // render timeline
    resize_canvas_to_client_size(canvas, true);
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, cw, ch);
    const dx = cw / video.duration;

    //const g = ctx.createLinearGradient(0,0,0,ch);
    //g.addColorStop(0, '#444');
    //g.addColorStop(0.125, '#668');
    //g.addColorStop(0.824, '#668');
    //g.addColorStop(1, '#444');
    //ctx.fillStyle = g;
    ctx.fillStyle = '#745';
    ctx.strokeStyle = 'rgba(255,255,255,0.125)';
    ctx.lineWidth = 1;
    for (let i = 0; i < timeline.length; i += 2) {
        const t0 = timeline[i].time;
        const t1 = timeline[i+1].time;
        const text = timeline[i].text;
        assert(text);
        const x0 = Math.floor(dx * t0);
        const x1 = Math.floor(dx * t1);
        ctx.fillRect(x0, 0, x1-x0, ch);
        ctx.strokeRect(x0, 0, x1-x0-1, ch);
    }

    ctx.fillStyle = 'rgba(0,0,0, 0.5)';
    ctx.fillRect(0,0,cw,1);
    ctx.fillRect(0,ch-1,cw,1);

    // playhead
    {
        ctx.fillStyle = '#c80';
        const t = video.currentTime;
        const x = Math.floor(dx * t);
        ctx.fillRect(x, 0, 3, ch);
    }
}

function parse_timecode(s, fps) {
    const bits = s.split(/[:,.]/).map(x => +x);
    const secs =
        bits[3]/fps +
        bits[2] +
        60*bits[1] +
        3600*bits[0];
    return secs;
}

function format_timecode(secs, fps) {
    const ff = Math.round(fps * (secs - Math.floor(secs)))
    const ss = Math.floor(secs) % 60
    const mm = Math.floor(secs/60) % 60
    const hh = Math.floor(secs/3600) % fps
    function f(x) { return (''+x).padStart(2, '0') }
    return `${f(hh)}:${f(mm)}:${f(ss)}:${f(ff)}`;
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
            toggle_playback();
            e.preventDefault();
            break;
        case 'KeyM':
            toggle_muted();
            e.preventDefault();
            break;
        case 'ArrowLeft':
            jump_to_next_marker(-1);
            e.preventDefault();
            break;
        case 'ArrowRight':
            jump_to_next_marker(1);
            e.preventDefault();
            break;
        default:
            break;
    }
});

function toggle_playback() {
    video.paused ? video.play() : video.pause();
}

function toggle_muted() {
    video.muted = !video.muted;
}

function scrub_to_input_event(e) {
    const cw = canvas.width;
    const x = e.offsetX;
    const t = video.duration * (x / cw);
    video.currentTime = t;
}

function jump_to_next_marker(dir) {
    const idx = timeline_idx + dir;
    let t; 
    if (idx < 0)
        t = 0;
    else if (idx >= timeline.length)
        t = video.duration;
    else
        t = timeline[idx].time;
    video.currentTime = t;
}
