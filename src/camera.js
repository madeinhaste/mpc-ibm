import {vec3, vec4, mat4, quat} from 'gl-matrix';
import {DEG2RAD} from './utils';

export class Camera {
    constructor() {
        this.fov = 60 * DEG2RAD;
        this.near = 0.01;
        this.far = 1000;

        this.ortho = false;
        this.ortho_scale = 1000;

        this.viewport = vec4.create();
        this.projection = mat4.create();
        this.view = mat4.create();
        this.view_projection = mat4.create();

        this.mvp = mat4.create();
        this.inv_mvp = mat4.create();
        this.inv_view = mat4.create();
        this.view_pos = vec3.create();
    }

    update() {
        const aspect = this.viewport[2] / this.viewport[3];

        if (this.ortho) {
            const h = this.ortho_scale;
            const w = aspect * h;
            mat4.ortho(this.projection, -w, w, -h, h, -this.far, this.far);
        } else {
            mat4.perspective(this.projection, this.fov, aspect, this.near, this.far);
        }

        mat4.multiply(this.view_projection, this.projection, this.view);
        mat4.multiply(this.mvp, this.projection, this.view);
        mat4.invert(this.inv_mvp, this.mvp);
        mat4.invert(this.inv_view, this.view);

        this.view_pos[0] = this.inv_view[12];
        this.view_pos[1] = this.inv_view[13];
        this.view_pos[2] = this.inv_view[14];
    }
}

