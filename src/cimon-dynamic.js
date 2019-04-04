import {Howl, Howler} from './howler';
import mins_to_sound from './cimon-mins-to-sound';
import {assets} from './cimon-common';

export function init_cimon_dynamic() {

    function sound(name, cb) {
        const path = `sounds/dynamic/cimon-${name}`;
        const opts = cb ? {onload: cb} : {};
        return assets.sound(path, opts);
    }

    const sounds = {
        head: sound('head'),
        tail: sound('tail'),
        time: null,
    };

    function stop() {
        Object.values(sounds).forEach(s => s && s.stop());
    }

    function play(hours, delay=0) {
        const mins = 60 * hours;
        if (mins < 10)
            return;

        let name;
        for (let i = 0; i < mins_to_sound.length; i += 2) {
            const m = mins_to_sound[i + 0];
            const n = mins_to_sound[i + 1];
            if (mins >= m) {
                name = n;
                break;
            }
        }

        if (!name)
            return;

        // kill current sounds
        stop();

        console.log('SOUND NAME:', name);
        sounds.time = sound(name, function() {
            const d0 = delay;
            const d1 = d0 + sounds.head.duration();
            const d2 = d1 + sounds.time.duration();
            sounds.head.play(undefined, false, d0);
            sounds.time.play(undefined, false, d1);
            sounds.tail.play(undefined, false, d2);
        });
    }

    return {play, stop};
}

