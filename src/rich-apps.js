//import es6_object_assign from 'es6-object-assign';
//es6_object_assign.polyfill();
//import 'core-js/stable';
//import 'regenerator-runtime/runtime';
import '@babel/polyfill';
import 'whatwg-fetch';

import {init_cimon_app} from './cimon-app';
import {init_airplane_app} from './airplane-app';
import {assert} from './utils';
import {Howl} from './howler';

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

window.RI_Cimon = make_RI_App(init_cimon_app);
window.RI_Airplane = make_RI_App(init_airplane_app);

window.RI_start_hook = function() {
    provoke_howler_unlock();
};

function provoke_howler_unlock() {
    // create an empty sound to start the context and add unlock events
    new Howl({src: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'});
}
