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

export function copy_mat4(dst, dp, src, sp) {
    for (let i = 0; i < 16; ++i)
        dst[dp++] = src[sp++];
}

export function copy_vec2(dst, dp, src, sp) {
    for (let i = 0; i < 2; ++i)
        dst[dp++] = src[sp++];
}

export function copy_vec3(dst, dp, src, sp) {
    for (let i = 0; i < 3; ++i)
        dst[dp++] = src[sp++];
}

export function copy_vec4(dst, dp, src, sp) {
    for (let i = 0; i < 4; ++i)
        dst[dp++] = src[sp++];
}

export function mat4_getRotation2(out, mat) {
    var m11 = mat[0],
        m12 = mat[1],
        m13 = mat[2],
        m21 = mat[4],
        m22 = mat[5],
        m23 = mat[6],
        m31 = mat[8],
        m32 = mat[9],
        m33 = mat[10];
    var s1 =1/ Math.sqrt(m11 * m11 + m12 * m12 + m13 * m13);
    var s2= 1/Math.sqrt(m21 * m21 + m22 * m22 + m23 * m23);
    var s3 = 1/Math.sqrt(m31 * m31 + m32 * m32 + m33 * m33);
    var trace = mat[0]*s1 + mat[5]*s2 + mat[10]*s3;
    var S = 0;
    if (trace > 0) { 
        S = Math.sqrt(trace + 1.0) * 2;
        out[3] = 0.25 * S;
        out[0] = (mat[6]*s3 - mat[9]*s2) / S;
        out[1] = (mat[8]*s1 - mat[2]*s3) / S; 
        out[2] = (mat[1]*s2 - mat[4]*s1) / S; 
    } else if ((mat[0]*s1 > mat[5]*s2)&(mat[0] *s1> mat[10]*s3)) { 
        S = Math.sqrt(1.0 + mat[0]*s1 - mat[5]*s2- mat[10]*s3) * 2;
        out[3] = (mat[6]*s3 - mat[9]*s2) / S;
        out[0] = 0.25 * S;
        out[1] = (mat[1]*s2 + mat[4]*s1) / S; 
        out[2] = (mat[8]*s1 + mat[2]*s3) / S; 
    } else if (mat[5]*s2 > mat[10]*s3) { 
        S = Math.sqrt(1.0 + mat[5]*s2 - mat[0]*s1 - mat[10]*s3) * 2;
        out[3] = (mat[8]*s1 - mat[2]*s3) / S;
        out[0] = (mat[1]*s2 + mat[4]*s1) / S; 
        out[1] = 0.25 * S;
        out[2] = (mat[6]*s3 + mat[9]*s2) / S; 
    } else { 
        S = Math.sqrt(1.0 + mat[10]*s3 - mat[0] *s1- mat[5]*s2) * 2;
        out[3] = (mat[1]*s2 - mat[4]*s1) / S;
        out[0] = (mat[8]*s1 + mat[2]*s3) / S;
        out[1] = (mat[6]*s3 + mat[9]*s2) / S;
        out[2] = 0.25 * S;
    }

    return out;
};
