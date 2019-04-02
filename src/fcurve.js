import {lerp, clamp} from './utils.js';

export const FC_STEP = 0;
export const FC_LINE = 1;
export const FC_EASE = 2;
export const FC_CURVE = 3;

class FKey {
    constructor(t=0, v=0) {
        this.time = t;
        this.value = v;
        this.interp = FC_STEP;
    }

    dump() {
        return { t: this.time, v: this.value, i: this.interp };
    }

    load(ob) {
        this.time = ob.t;
        this.value = ob.v;
        this.interp = ob.i;
    }
}

function compare_keys(a, b) {
    return a.time - b.time;
}

// https://www.cs.helsinki.fi/group/goa/mallinnus/curves/curves.html
export class FCurve {
    constructor() {
        this.name = 'speed';
        this.color = 'red';
        this.keys = [];
    }

    dump() {
        return {
            name: this.name,
            color: this.color,
            keys: this.keys.map(k => k.dump())
        }
    }

    load(ob) {
        this.name = ob.name;
        this.color = ob.color;
        this.keys = ob.keys.map(ob => {
            const key = new FKey;
            key.load(ob);
            return key;
        });
        this.update();
    }

    find_key_idx(time) {
        const keys = this.keys;
        const n = keys.length;
        for (let i = 0; i < n; ++i) {
            const k = keys[i];
            if (k.time === time)
                return i;
        }
        return -1;
    }

    find_key(time) {
        const idx = this.find_key_idx(time);
        if (idx < 0)
            return null;
        return this.keys[idx];
    }

    set_key(time, value) {
        // XXX could be sortedIndex
        let key = this.find_key(time);
        if (key) {
            key.value = value;
        } else {
            key = new FKey(time, value);
            key.interp = FC_EASE;
            this.keys.push(key);
            this.update();
        }
        return this;
    }

    clear_key(time) {
        let idx = this.find_key_idx(time);
        if (idx < 0) {
            return;
        }

        this.keys.splice(idx, 1);
        return this;
    }

    has_key(time) {
        let idx = this.find_key_idx(time);
        return idx >= 0;
    }

    toggle_key(time, value) {
        if (this.has_key(time))
            this.clear_key(time);
        else
            this.set_key(time, value);
        return this;
    }

    update() {
        this.keys.sort(compare_keys);
    }

    evaluate(t) {
        const keys = this.keys;
        const n_keys = keys.length;

        if (n_keys === 0)
            return 0.0;

        if (n_keys == 1)
            return keys[0].value;

        let idx = 0;
        while (idx < n_keys) {
            if (keys[idx].time >= t)
                break;
            ++idx;
        }

        if (idx >= n_keys) {
            // past the end
            return keys[n_keys-1].value;
        }

        if (idx === 0) {
            // past/on start
            return keys[0].value;
        }

        // interpolate
        const key0 = keys[idx - 1];
        const key1 = keys[idx];
        const u = (t - key0.time) / (key1.time - key0.time);

        switch (key0.interp) {
            case FC_STEP:
                return key0.value;

            case FC_LINE:
                return lerp(key0.value, key1.value, u);

            case FC_EASE: {
                // catmull-rom with tension tau
                // https://www.cs.cmu.edu/~462/projects/assn2/assn2/catmullRom.pdf
                // http://algorithmist.net/docs/catmullrom.pdf

                const key00 = keys[Math.max(0, idx - 2)];
                const key11 = keys[Math.min(n_keys-1, idx + 1)];

                const uu = u*u;
                const uuu = u*uu;
                const tau = 0.5;

                const b0 = -tau*u + 2*tau*uu - tau*uuu;
                const b1 = 1 + (tau-3)*uu + (2-tau)*uuu;
                const b2 = tau*u + (3-2*tau)*uu + (tau-2)*uuu;
                const b3 = -tau*uu + tau*uuu;
                    
                return (b0*key00.value +
                        b1*key0.value +
                        b2*key1.value +
                        b3*key11.value);
            }

            case FC_HERMITE: {
                let uu = u * u;
                let uuu = u * uu;

                let b0 = 2*uuu - 3*uu + 1;
                let b1 = -2*uuu + 3*uu;
                let b2 = uuu - 2*uu + u;
                let b3 = uuu - uu;

                return b0*cp0.value + b1*cp1.value +
                       b2*cp0.slope + b3*cp1.slope;
            }
        }
    }

    evaluate_range(t0, t1, dt) {
        let t = t0;
        let vs = [];
        while (t <= t1) {
            vs.push(this.evaluate(t));
            t += dt;
        }
        return vs;
    }
}
