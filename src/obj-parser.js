import {assert, each_line} from './utils';
import {vec3} from 'gl-matrix';

export function parse_OBJ(text) {

    function iter_OBJ(text, callback) {
        each_line(text, function(line) {
            line = line.trim();
            if (line[0] == '#') return;
            var bits = line.split(/\s+/);
            if (bits.length) callback(bits);
        });
    }

    function process_OBJ(text) {
        const v = vec3.create();
        const vi = [0, 0, 0];

        function parse_vertex_attrib(out, bits) {
            for (let i = 1; i < bits.length; ++i)
                out[i - 1] = parseFloat(bits[i]);
        }

        function parse_face_indices(out, str) {
            const e = str.split('/');

            out[0] = parseInt(e[0]);
            out[1] = out[2] = 0;

            if (e.length == 2) {
                out[1] = parseInt(e[1]);
            } else if (e.length == 3) {
                if (e[1]) out[1] = parseInt(e[1]);
                out[2] = parseInt(e[2]);
            }

            --out[0];
            --out[1];
            --out[2];

            return out;
        }

        const data = {
            pos: [],
            nor: [],
            tex: [],
            pos_index: [],
            nor_index: [],
            tex_index: [],
            materials: [],
        };

        let material = {
            name: 'default',
            count: 0,
        };
        data.materials.push(material);

        iter_OBJ(text, function(bits) {
            var cmd = bits[0];

            if (cmd == 'v') {
                parse_vertex_attrib(v, bits);
                data.pos.push(v[0], v[1], v[2]);
            }

            if (cmd == 'vt') {
                parse_vertex_attrib(v, bits);
                data.tex.push(v[0], v[1]);
            }

            if (cmd == 'vn') {
                parse_vertex_attrib(v, bits);
                data.nor.push(v[0], v[1], v[2]);
            }

            if (cmd == 'f') {
                var nsides = bits.length - 1;
                assert(nsides === 3);
                for (var i = 0; i < nsides; ++i) {
                    parse_face_indices(vi, bits[i + 1]);
                    if (vi[0] >= 0) data.pos_index.push(vi[0]);
                    if (vi[1] >= 0) data.tex_index.push(vi[1]);
                    if (vi[2] >= 0) data.nor_index.push(vi[2]);
                }
                material.count += nsides;
            }

            if (cmd == 'usemtl') {
                data.materials.push(material = {
                    name: bits[1],
                    count: 0,
                });
            }

        });

        const norms = [];     // maybe recalc?
        const verts = [];
        const uvs = [];
        const tag_to_index = new Map;

        const elems = [];
        const n_elems = data.pos_index.length;

        for (var i = 0; i < n_elems; ++i) {
            const pos_index = data.pos_index[i];
            const nor_index = data.nor_index[i];
            const tex_index = data.tex_index[i];

            const tag = ((pos_index * n_elems) + tex_index) * n_elems + nor_index;
            if (tag_to_index.has(tag)) {
                elems.push(tag_to_index.get(tag));
            } else {
                const index = verts.length/3;
                tag_to_index.set(tag, index);
                elems.push(index);

                var sp = 3 * pos_index;
                verts.push(data.pos[sp + 0], data.pos[sp + 1], data.pos[sp + 2]);
                var sp = 3 * nor_index;
                norms.push(data.nor[sp + 0], data.nor[sp + 1], data.nor[sp + 2]);
                var sp = 2 * tex_index;
                uvs.push(data.tex[sp + 0], data.tex[sp + 1]);
            }
        }

        assert((verts.length/3) <= 65536);

        return {
            positions: new Float32Array(verts),
            normals: new Float32Array(norms),
            texcoords: new Float32Array(uvs),
            elements: new Uint16Array(elems),
            n_elements: elems.length,
            n_vertices: verts.length/3,
            parts: data.materials.filter(m => m.count),
        };
    }

    return process_OBJ(text);
}
