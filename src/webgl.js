import {dump_glsl_error} from './webgl-debug';

export function create_gl(el, opts) {
    console.assert(!window.gl);
    window.gl = el.getContext('webgl', opts);
    return gl;
}

export function create_buffer(target, data=null, usage) {
    if (Array.isArray(data)) {
        // shortcut for float data
        data = new Float32Array(data);
    }

    let b = gl.createBuffer();
    gl.bindBuffer(target, b);
    if (data)
        gl.bufferData(target, data, usage || gl.STATIC_DRAW);
    return b;
}

export function compile_shader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var log = gl.getShaderInfoLog(shader);

        throw {
            error: 'shader_compile_error',
            type: type == gl.VERTEX ? 'VERTEX' : 'FRAGMENT',
            source: source,
            log: log,
        };

        //console.error('GLSL compile error:', log);
        //return null;
    }
    return shader;
}

function compile_program(vertex_source, fragment_source) {
    let vertex_shader = compile_shader(gl.VERTEX_SHADER, vertex_source);
    let fragment_shader = compile_shader(gl.FRAGMENT_SHADER, fragment_source);

    if (!vertex_shader || !fragment_shader)
        return null;

    var program = gl.createProgram();
    gl.attachShader(program, vertex_shader);
    gl.attachShader(program, fragment_shader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        var log = gl.getProgramInfoLog(program);
        //console.error('GLSL link error:', log);
        //return null;
        //
        throw {
            error: 'program_link_error',
            source: [vertex_source, fragment_source],
            log: log,
        };

    }

    return program;
}

// keeps track of array flag of the vertex attributes
class AttribArrayManager {
    constructor() {
        this.enabledMask = 0;
        this.maxEnabledIndex = -1;
    }

    disableAll() {
        for (var index = 0; index <= this.maxEnabledIndex; ++index) {
            var mask = 1 << index;
            if (mask & this.enabledMask)
                gl.disableVertexAttribArray(index);
        }

        this.enabledMask = 0;
        this.maxEnabledIndex = -1;
    }

    enable(index) {
        var mask = 1 << index;
        if (!(mask & this.enabledMask)) {
            gl.enableVertexAttribArray(index);
            this.enabledMask |= mask;
            this.maxEnabledIndex = Math.max(this.maxEnabledIndex, index);
        }
    }

    disable(index) {
        var mask = 1 << index;
        if (mask & this.enabledMask) {
            gl.disableVertexAttribArray(index);
            this.enabledMask &= ~mask;
            // XXX don't bother changing maxEnabledIndex
        }
    }
}

let attribArrayManager = new AttribArrayManager();

class Program {
    constructor(opts) {
        this.name = opts.name || '';
        this.program = null;
        this.attribs = {};
        this.uniforms = {};

        if (opts.program)
            this._init(opts.program);
        else if (opts.vertex && opts.fragment)
            this.compile(opts.vertex, opts.fragment);
        else {
            // delayed start
        }
    }

    compile(vertex_source, fragment_source) {
        console.assert(!this.program);
        this._init(compile_program(vertex_source, fragment_source));
    }

    _init(program) {
        this.program = program;

        var numAttribs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
        for (var i = 0; i < numAttribs; ++i) {
            var attrib = gl.getActiveAttrib(program, i);
            this.attribs[attrib.name] = {
                index: gl.getAttribLocation(program, attrib.name),
                name: attrib.name,
                size: attrib.size,
                type: attrib.type,
            };
        }

        var nextTexUnit = 0;
        function assignTexUnit(uniform) {
            if (uniform.type == gl.SAMPLER_2D || uniform.type == gl.SAMPLER_CUBE) {
                var unit = nextTexUnit;
                nextTexUnit += uniform.size;
                return unit;
            }
            return -1;
        }

        var numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (var i = 0; i < numUniforms; ++i) {
            var uniform = gl.getActiveUniform(program, i);
            this.uniforms[uniform.name] = {
                location: gl.getUniformLocation(program, uniform.name),
                name: uniform.name,
                size: uniform.size,
                type: uniform.type,
                texUnit: assignTexUnit(uniform),
            };
        }
    }

    use() {
        if (!this.program) {
            // not initialized
            return null;
        }

        gl.useProgram(this.program);
        attribArrayManager.disableAll();
        return this;
    }

    getUniformLocation(name) {
        var uniform = this.uniforms[name];
        return uniform ? uniform.location : null;
    }

    getAttribIndex(name) {
        var attrib = this.attribs[name];
        return attrib ? attrib.index : -1;
    }

    uniform1i(name, x) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform1i(location, x);
    }

    uniform1f(name, x) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform1f(location, x);
    }

    uniform2f(name, x, y) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform2f(location, x, y);
    }

    uniform3f(name, x, y, z) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform3f(location, x, y, z);
    }

    uniform4f(name, x, y, z, w) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform4f(location, x, y, z, w);
    }

    uniform1iv(name, v) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform1iv(location, v);
    }

    uniform1fv(name, v) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform1fv(location, v);
    }

    uniform2fv(name, v) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform2fv(location, v);
    }

    uniform3fv(name, v) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform3fv(location, v);
    }

    uniform4fv(name, v) {
        var location = this.getUniformLocation(name);
        if (location)
            gl.uniform4fv(location, v);
    }

    uniformMatrix3fv(name, data, transpose) {
        var location = this.getUniformLocation(name);
        if (location) {
            transpose = transpose || false;
            gl.uniformMatrix3fv(location, transpose, data);
        }
    }

    uniformMatrix4fv(name, data, transpose) {
        var location = this.getUniformLocation(name);
        if (location) {
            transpose = transpose || false;
            gl.uniformMatrix4fv(location, transpose, data);
        }
    }

    uniformSampler(name, target, texture) {
        var uniform = this.uniforms[name];
        if (uniform) {
            gl.activeTexture(gl.TEXTURE0 + uniform.texUnit);
            gl.bindTexture(target, texture);
            gl.uniform1i(uniform.location, uniform.texUnit);
        }
    }

    uniformSampler2D(name, texture) {
        this.uniformSampler(name, gl.TEXTURE_2D, texture);
    }

    uniformSamplerCube(name, texture) {
        this.uniformSampler(name, gl.TEXTURE_CUBE_MAP, texture);
    }

    enableVertexAttribArray(name) {
        var attrib = this.attribs[name];
        if (attrib) {
            attribArrayManager.enable(attrib.index);
            return attrib.index;
        } else {
            return -1;
        }
    }

    disableVertexAttribArray(name) {
        var attrib = this.attribs[name];
        if (attrib) {
            attribArrayManager.disable(attrib.index);
            return attrib.index;
        } else {
            return -1;
        }
    }

    vertexAttribPointer(name, size, type, normalize, offset, stride) {
        var attrib = this.attribs[name];
        if (attrib) {
            attribArrayManager.enable(attrib.index);
            gl.vertexAttribPointer(attrib.index, size, type, normalize, offset, stride);
        }
    }
}

export function create_program(opts) {
    try {
        return new Program(opts);
    }
    catch (error) {
        dump_glsl_error(opts.name, error);
        console.log('ERROR:', error);
    }
}

export function create_texture(options) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    options = options || {};
    options.width = options.width || options.size || 4;
    options.height = options.height || options.width;
    options.format = options.format || gl.RGBA;
    options.type = options.type || gl.UNSIGNED_BYTE;
    options.mag = options.mag || options.filter || gl.NEAREST;
    options.min = options.min || options.mag;

    options.wrapS = options.wrapS || options.wrap || gl.CLAMP_TO_EDGE;
    options.wrapT = options.wrapT || options.wrapS;

    options.dataFormat = options.dataFormat || options.format;
    options.data = options.data || null;

    const level = 0;
    const border = 0;

    const image = options.image || options.video;
    if (image) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, options.flip ? 1 : 0);
        gl.texImage2D(gl.TEXTURE_2D, level, options.format, options.format, options.type, image);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, level, options.format,
                      options.width, options.height, border,
                      options.dataFormat, options.type, options.data);
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, options.wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, options.wrapT);

    /*
    if (options.aniso) {
        var ext = webgl.extensions.EXT_texture_filter_anisotropic;
        ext && gl.texParameteri(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, options.aniso);
    }
    */

    return texture;
}

// GLSL pass-thru template literal for syntax highlighter
export const GLSL = (chunks, ...args) => {
    let out = '';
    chunks.forEach((chunk, i) => {
        out += chunk + (args[i] || '');
    });
    return out;
};
