import {Howl, Howler} from './howler';
//Howler.autoUnlock = false;

let sound;

function provoke_howler_unlock() {
    // create an empty sound to start the context and add unlock events
    new Howl({src: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'});
}

window.ap_init = function() {
    /*
    sound = new Howl({
        src: ['assets/rich/cimon/sounds/cimon-intro.m4a'],
    });
    */

    // silent clip to arm the unlock
    //const data = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    //const sound = new Howl({src: data});
    provoke_howler_unlock();

    //console.log(Howler);
    //Howler.volume(1);
};

window.ap_play = function() {
    sound.play();
};

/*
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
*/
