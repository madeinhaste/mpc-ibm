import {vec3, mat3} from 'gl-matrix';

const EPSILON = 0.0001;

var v1 = vec3.create();
var v2 = vec3.create();

export function closest_points_between_rays(out1, out2, o1, d1, o2, d2)
{
    var A = vec3.dot(d1, d1);
    var B = vec3.dot(d1, d2);
    var C = vec3.dot(d2, d2);
    var D = A*C - B*B;

    if (Math.abs(D) < EPSILON) {
        // parallel
        return Infinity;
    }

    vec3.sub(v1, o1, o2);
    var E = vec3.dot(d1, v1);
    var F = vec3.dot(d2, v1);

    var s = (B*F - E*C) / D;
    var t = (A*F - E*B) / D;

    vec3.scaleAndAdd(v1, o1, d1, s);
    vec3.scaleAndAdd(v2, o2, d2, t);

    if (out1) vec3.copy(out1, v1);
    if (out2) vec3.copy(out2, v2);

    return vec3.distance(v1, v2);
}

export function ray_plane_intersect(out, ray_o, ray_d, plane_o, plane_n)
{
    //console.log(ray_o, ray_d, plane_o, plane_n);
    var den = vec3.dot(plane_n, ray_d);
    if (Math.abs(den) < EPSILON) {
        // parallel
        return false;
    }

    vec3.sub(out, plane_o, ray_o);
    var t = vec3.dot(out, plane_n) / den;
    if (t < 0)
        return false;

    vec3.scaleAndAdd(out, ray_o, ray_d, t);
    return true;
}

export function ray_sphere_intersect(sphere, ro, rd) {
    const d = v1;
    const radius = sphere[3];
    vec3.sub(d, ro, sphere);
    const b = vec3.dot(rd, d);
    const c = vec3.dot(d, d) - radius * radius;
    let t = b * b - c;
    if (t > 0.0)
        t = -b - Math.sqrt(t);
    return t;
}

export function handedness(v0, v1) {
    var m = mat3.create();
}
