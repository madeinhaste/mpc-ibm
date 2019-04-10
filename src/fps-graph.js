export function make_fps_graph() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const cw = 256;
    const ch = 128;

    canvas.width = cw;
    canvas.height = ch;

    Object.assign(canvas.style, {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: cw + ' px',
        height: ch + ' px',
        zIndex: 100,
    });
    document.body.appendChild(canvas);

    const samples = new Float32Array(cw);
    let sample_idx = 0;
    let max_value = 128;
    let dirty_idx = 0;
    let budget = 1000/60;

    function update(ms) {
        dirty_idx = sample_idx;
        samples[sample_idx++] = ms;
        if (sample_idx === samples.length)
            sample_idx = 0;
        //max_value = Math.max(max_value, ms);
    }

    function draw() {
        //ctx.clearRect(0, 0, cw, ch);

        //ctx.fillStyle = 'rgba(0,0,0, 0.25)';
        //ctx.fillRect(0, 0, cw, ch);

        ctx.font = '18px "IBM Plex Sans"';
        ctx.fillStyle = '#000';
        ctx.textAlign = 'right';

        //const text = `${sample_idx}`;
        //ctx.fillText(text, cw-5, 20);

        const i = dirty_idx;
        /*
        for (let i = 0; i < cw; ++i) {
            const t = samples[i];
            const h = ~~(t * ch/max_value);
            //ctx.fillRect(i, ch-h, 1, h);
            ctx.fillRect(i, ch-h, 1, h);
        }
        */
        {
            ctx.clearRect(i, 0, 1, ch);
            const t = samples[i];
            ctx.fillStyle = (t <= (budget+1)) ? '#0f8' : '#f40';
            const h = ~~(t * ch/max_value);
            //ctx.fillRect(i, ch-h, 1, h);
            ctx.fillRect(i, ch-h, 1, h);
        }

        {
            const t = budget;
            const h = (t * ch/max_value);
            let y = ch - h;
            let alpha = 0.5;
            ctx.fillStyle = '#000';
            while (y > 0) {
                ctx.globalAlpha = alpha;
                alpha *= 0.75;
                ctx.fillRect(i, ~~y, 1, 1);
                y -= h;
            }
            ctx.globalAlpha = 1;
        }
    }

    function clear() {
        ctx.clearRect(0, 0, cw, ch);
        sample_idx = 0;
    }

    return {update, draw, clear};
}
