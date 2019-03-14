import './reloader';
import './qrcode-overlay';
import H from './hyperHTML';
import {init_rotation_sensor} from './rotation-sensor';
import {init_scenes} from './scenes';

const MODE_LANDSCAPE = 0;
const MODE_PORTRAIT = 1;

// i want  video to be:
// centered
// fitting the width/height

const scenes = init_scenes();
let video = null;
scenes.ready().then(function() {
    video = scenes.video;
    init_html();
    animate();
});

function Debug(text) {
    return H(Debug)`<div class=debug>${text}</div>`;
}

function Display(mode, rotate) {
    const style = {
        transition: 'all 0.5s ease',
        transform: `rotate(${rotate}deg)`,
    };

    let text = mode ? scenes.current_text : null;

    if (text) {
        text = text
            .replace('[', '<em>')
            .replace(']', '</em>');
        text = [text];
    }

    return H(Display)`
    <div class=display style=${style}>
        ${text}
    </div>`;
}

function init_html() {
    H(document.body)`
        <div class=video-center>
            ${video}
        </div>
        ${Display(0, 0)}
        ${Debug()}
    `;
}

// consider lock only: what are the values from the sensor?
const sensor = init_rotation_sensor();
const ff = x => (''+Math.round(x)).padStart(4, '.');

function update() {
    const {orientation: o, rotation: r, euler: d} = sensor.sample();
    Debug(`ori=${o} rot=${r}
    α ${ff(d.alpha)}  β ${ff(d.beta)}  γ ${ff(d.gamma)}
    `);

    let mode = 0;
    if (r === 0 || r === 2)
        mode = 1;

    let n = r;
    if (o === 0) {
    }
    else if (o === 1) {
        n += 3;
    }
    else if (o === 2) {
        n += 2;
    }
    else if (o === 3) {
        n += 1;
    }

    //const n = (r + (o+2)) % 4;
    const rotate = -(n%4) * 90;
    Display(mode, rotate);
}

// for devtools
function get_mode_rotate() {
    let mode = 0;
    let rotate = 0;

    if ('orientation' in screen) {
        // devtools/chrome
        const type = screen.orientation.type;
        mode = (type === 'portrait-primary' || type === 'portrait-secondary') ? 1 : 0;
        rotate = mode ? 0 : 0;
    }
    else if ('orientation' in window) {
        // iOS
        const {orientation: o, rotation: r} = sensor.sample();
        //Debug(`ori=${o} rot=${r} α ${ff(d.alpha)}  β ${ff(d.beta)}  γ ${ff(d.gamma)}`);

        mode = 0;
        if (r === 0 || r === 2)
            mode = 1;

        let n = r;
        if (o === 0) { }
        else if (o === 1) { n += 3; }
        else if (o === 2) { n += 2; }
        else if (o === 3) { n += 1; }

        rotate = -(n%4) * 90;
    }

    return [mode, rotate];
}

function update2() {
    scenes.update();
    const [mode, rotate] = get_mode_rotate();
    Display(mode, rotate);

    // so don't stop video (enforce landscape) if current_text is null
    update_video(mode, !!scenes.current_text);
}

// update video element style and playback
function update_video(mode, in_scene) {
    const video_w = video.videoWidth;
    const video_h = video.videoHeight;
    const container_w = window.innerWidth;
    const container_h = window.innerHeight;

    let angle, scale, pause, filter;
    if (mode === MODE_PORTRAIT) {
        angle = -90;
        // max-aspect for portrait
        scale = Math.max(
            container_w/video_h,
            container_h/video_w);
        pause = true;
        filter = 'brightness(0.5) saturate(0.3)'
    } else {
        angle = 0;
        // min-aspect for landscape
        scale = Math.min(
            container_w/video_w,
            container_h/video_h);
        pause = false;
        filter = null;
    }

    const t = `rotate(${angle}deg) scale(${scale})`;
    //Debug(t);
    video.style.transform = t;

    if (in_scene) {
        // only pause in scene
        set_video_paused(video, pause);
        video.style.filter = filter;
    } else {
        set_video_paused(video, false);
        video.style.filter = null;
    }
}

// change playback status of video, catching any autoplay errrors
function set_video_paused(video, pause) {
    if (video.paused === pause)
        return;

    const promise = pause ? video.pause() : video.play();
    return promise && promise.catch(err => {});
}

function animate() {
    requestAnimationFrame(animate);
    update2();
}

/*
document.body.addEventListener('touchend', e => {
    if ('fullscreenElement' in document) {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen(); 
        }
    }
    else if ('webkitFullscreenElement' in document) {
        if (!document.webkitFullscreenElement) {
            document.documentElement.webkitRequestFullscreen();
        } else
            document.webkitExitFullscreen(); 
    }
});
*/
