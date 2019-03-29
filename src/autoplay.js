//import {Howl, Howler} from './howler';
//Howler.autoUnlock = false;

/*
const sound = new Howl({
    src: ['assets/rich/cimon/sounds/cimon-intro.m4a'],
});
*/
import webAudioTouchUnlock from 'web-audio-touch-unlock';

const AudioContext = (
    window.AudioContext ||
    window.webkitAudioContext);

let ctx = null;

function load_sound(url) {
    return fetch(url)
        .then(r => r.arrayBuffer())
    //.then(ab => ctx.decodeAudioData(ab));
        .then(ab => {
            return new Promise((res, rej) => {
                ctx.decodeAudioData(ab, res, rej);
            });
        });
}

function play_sound() {
    load_sound('assets/rich/cimon/sounds/cimon-intro.m4a')
        .then(buffer => {
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            //source.noteOn(0);
            source.start(0.5);
        });
}

window.RI_start_audio = function() {
    console.log('hello');
    ctx = new AudioContext;

    webAudioTouchUnlock(ctx)
        .then(good => {
            if (good) {
                console.log('GOOD');
                play_sound();
            } else {
                console.log('NO UNLOCK NEEDED');
                play_sound();
            }
        },
        err => {
            console.error(err);
        });

    //unlock(ctx).then(play_sound);
    //unlock(Howler.ctx);
    //sound.play();
};

function unlock(ctx) {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    //source.noteOn(0);
    source.start(0);

    return new Promise((res, rej) => {
        let count = 10;

        function check_state() {
            console.log('check_state');
            const s = source.playbackState;
            if (s == source.PLAYING_STATE ||
                s == source.FINISHED_STATE)
            {
                $('.debug').text('UNLOCKED');
                res();
            }
            else
            {
                $('.debug').text('NOT UNLOCKED');
                if (--count === 0)
                    res();
                else {
                    setTimeout(check_state, 100);
                }
            }
        }
        check_state();

    });
}
