import {init_cimon_app} from './cimon-app';
import {init_airplane_app} from './airplane-app';
import {assert} from './utils';
import {Howler} from 'howler';

function make_RI_App(factory) {
    return function(opts) {
        let app = null;

        this.init = function(opts2) {
            assert(!app);
            const o = Object.assign({}, opts, opts2);
            app = factory(o);
        }

        this.kill = function() {
            if (app) {
                app.kill();
                app = null;
            }
        };

        this.play = function() {
            app && app.play();
        };

        this.replay = function() {
            app && app.replay();
        };
    }
}

Object.assign(window, {
    RI_Cimon: make_RI_App(init_cimon_app),
    RI_Airplane: make_RI_App(init_airplane_app),
});

window.RI_start_hook = function() {
    // init audio context
    Howler.volume(1);
    console.log('rich: sound is', Howler.state);
    return Howler.state;
};
