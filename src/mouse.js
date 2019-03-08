import {vec2} from './vendor/gl-matrix.js';

// Tracks mouse events
export class Mouse {
    constructor(el) {
        this.el = el;
        this.pos = vec2.create();
        this.start = vec2.create();
        this.delta = vec2.create();
        this.button = -1;
        this.dragging = false;

        this.ondragstart = function() {};
        this.ondragmove = function() {};
        this.ondragend = function() {};
        this.onclick = function() {};

        el.addEventListener('contextmenu', e => {
            e.preventDefault();
        });

        el.addEventListener('mousedown', e => {
            this.update(e, true);
            this.dragging = true;
            this.ondragstart(e);
            e.preventDefault();
        });

        document.addEventListener('mouseup', e => {
            this.update(e);
            this.dragging = false;
            this.ondragend(e);

            // click detect
            {
                let click_dist = vec2.dist(this.pos, this.start);
                if (click_dist < 1) {
                    this.onclick(e);
                }
            }
        });

        document.addEventListener('mousemove', e => {
            this.update(e);
            if (this.dragging)
                this.ondragmove(e);
        });
    }

    update(e, start=false) {
        let x = e.offsetX;
        let y = e.offsetY;
        if (start) {
            vec2.set(this.delta, 0, 0);
            vec2.set(this.start, x, y);
        } else {
            vec2.sub(this.delta, [x, y], this.pos);
        }
        vec2.set(this.pos, x, y);
        this.button = e.button;
    }
}
