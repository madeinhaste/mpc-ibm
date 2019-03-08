import {vec2, vec3, vec4, mat4, quat} from 'gl-matrix';

// temps
let Q = quat.create();
let T = vec3.create();
let M = mat4.create();

let P = vec3.create();

export class Orbit {
    constructor() {
        this.rotate = vec3.create();
        this.translate = vec3.create();
        this.distance = 10;
        this.min_distance = 0.001;
        this.shake = vec2.create(); // screen place translate

        this.pos = vec3.create();
        this.dir = vec3.fromValues(0, 0, -1);
        this.up = vec3.fromValues(0, 1, 0);
    }

    pan(dx, dy) {
        quat.identity(Q);
        quat.rotateY(Q, Q, this.rotate[0]);
        quat.rotateX(Q, Q, this.rotate[1]);

        vec3.set(T, dx, dy, 0);
        vec3.transformQuat(T, T, Q);
        vec3.add(this.translate, this.translate, T);
    }

    tumble(ry, rx) {
        this.rotate[0] += ry;
        this.rotate[1] += rx;
    }


    dolly(dz) {
        this.distance = Math.max(this.min_distance, this.distance + dz);
    };

    zoom(sz) {
        this.distance = Math.max(this.min_distance, this.distance * sz);
    };

    update() {
        quat.identity(Q);
        quat.rotateY(Q, Q, this.rotate[0]);
        quat.rotateX(Q, Q, this.rotate[1]);

        vec3.set(this.dir, 0, 0, -1);
        vec3.transformQuat(this.dir, this.dir, Q);
        vec3.scaleAndAdd(this.pos, this.translate, this.dir, -this.distance);
    }

    get_view(out) {
        //let t = performance.now()/100;
        //let s = 10 * Math.sin(t);

        vec3.add(T, this.pos, this.dir);
        mat4.lookAt(out, this.pos, T, this.up);

        let s = this.shake;
        T[0] = s[0]*out[0] + s[1]*out[1]
        T[1] = s[0]*out[4] + s[1]*out[5]
        T[2] = s[0]*out[8] + s[1]*out[9]
        mat4.translate(out, out, T);
    }

    get_params() {
        return {
            rotate: Array.from(this.rotate),
            translate: Array.from(this.translate),
            distance: this.distance,
            min_distance: this.min_distance,
        };
    }

    set_params(o) {
        vec3.copy(this.rotate, o.rotate);
        vec3.copy(this.translate, o.translate);
        this.distance = o.distance;
        this.min_distance = o.min_distance;
        this.update();
    }
}
