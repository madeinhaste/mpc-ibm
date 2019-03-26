import {Howl, Howler} from 'howler';

export const assets = function() {
    let base = 'assets/rich/airplane';

    function text(path) {
        return fetch(`${base}/${path}`).then(r => r.text());
    }

    function image(path) {
        return new Promise((res, rej) => {
            const img = new Image;
            img.src = `${base}/${path}`;
            img.onload = _ => res(img);
        });
    }

    function sound(path, opts) {
        const exts = ['m4a'];
        const src = exts.map(ext => `${base}/${path}.${ext}`);
        return new Howl(Object.assign({src}, opts));
    }

    function set_base(path) {
        base = path;
    }

    return {set_base, text, image, sound};
}();

