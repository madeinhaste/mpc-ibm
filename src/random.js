const K0 = 2147483647;
const K1 = K0 - 1;
const K2 = 16807;

// https://gist.github.com/blixt/f17b47c62508be59987b
export class Random {
    constructor(seed) {
        seed = seed || Date.now();
        this.s = seed % K0;
        if (this.s <= 0)
            this.s += K1;
    }

    // [1 .. 2^32-2]
    next() {
        return this.s = (this.s * K2) % K0;
    }

    // [0 .. 1)
    float() {
        return (this.next() - 1) / K1;
    }

    // [a .. b)
    range(a, b) {
        if (!b) {
            b = a;
            a = 0;
        }
        return a + (this.next() % (b - a));
    }

    uniform(a, b) {
        const u = this.float();
        return (1-u)*a + u*b;
    }

    expovariate(lambda) {
        return -Math.log(1 - this.float()) / lambda;
    }

    choice(arr) {
        const n = arr.length;
        if (n) {
            const idx = this.next() % arr.length;
            return arr[idx];
        }
    }

    shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = this.range(i+1);
            const x = a[i];
            a[i] = a[j];
            a[j] = x;
        }
        return a;
    }
}
