import {vec3, vec4} from 'gl-matrix';

var tmpVec4 = vec4.create();

export class PickRay {
    constructor(camera) {
        this.camera = camera;
        this.origin = vec3.create();
        this.direction = vec3.create();
    }

    unproject(out, vec) {
        var viewport = this.camera.viewport;
        var v = tmpVec4;

        v[0] = (vec[0] - viewport[0]) * 2.0 / viewport[2] - 1.0;
        v[1] = (vec[1] - viewport[1]) * 2.0 / viewport[3] - 1.0;
        v[2] = 2.0 * vec[2] - 1.0;
        v[3] = 1.0;

        vec4.transformMat4(v, v, this.camera.inv_mvp);
        if (v[3] === 0)
            return false;

        out[0] = v[0] / v[3];
        out[1] = v[1] / v[3];
        out[2] = v[2] / v[3];
        return true;
    }

    fromWindowCoords(wx, wy) {
        var v0 = this.origin;
        var v1 = this.direction;
        v0[0] = v1[0] = wx;
        v0[1] = v1[1] = wy;
        v0[2] = 0.0;
        v1[2] = 1.0;
        this.unproject(v0, v0);
        this.unproject(v1, v1);
        vec3.subtract(v1, v1, v0);
        vec3.normalize(v1, v1);
    }
}
