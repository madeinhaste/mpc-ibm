import H from './hyperHTML';
import {each_line} from './utils';

const urls = {
    video: 'videos/smartscenes-190313.mp4',
    timecodes: 'data/smartscenes-timecodes.txt',
};

export function init_scenes() {
    let timeline = null;
    let timeline_idx = -1;

    const video = H`
    <video autoplay loop playsinline webkit-playsinline>
        <source src=${urls.video} type="video/mp4">
    </video>`;

    function await_video_metadata() {
        return new Promise((res, rej) => {
            video.onloadedmetadata = res;
        });
    }

    function ready() {
        return Promise.all([
            await_video_metadata(),
            create_timeline()
                .then(t => timeline = t),
        ]);
    }

    function toggle_playback() {
        video.paused ? video.play() : video.pause();
    }

    function toggle_muted() {
        video.muted = !video.muted;
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
        return update_timeline_idx();
    }

    return {
        video,
        ready,
        update,
        toggle_playback,
        toggle_muted,
        jump_to_next_marker,
        get current_text() {
            return timeline_idx < 0 ? null : timeline[timeline_idx].text;
        },
        get timeline() {
            return timeline;
        },
    };
}

async function create_timeline() {
    const rsp = await fetch(urls.timecodes);
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

    return markers.map((t, idx) => ({
        time: t,
        text: scripts[idx],
    }));
}

export function parse_timecode(s, fps) {
    const bits = s.split(/[:,.]/).map(x => +x);
    const secs =
        bits[3]/fps +
        bits[2] +
        60*bits[1] +
        3600*bits[0];
    return secs;
}

export function format_timecode(secs, fps) {
    const ff = Math.round(fps * (secs - Math.floor(secs)))
    const ss = Math.floor(secs) % 60
    const mm = Math.floor(secs/60) % 60
    const hh = Math.floor(secs/3600) % fps
    function f(x) { return (''+x).padStart(2, '0') }
    return `${f(hh)}:${f(mm)}:${f(ss)}:${f(ff)}`;
}
