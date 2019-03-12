import './reloader';
import './qrcode-overlay';
import {init_rotation_sensor} from './rotation-sensor';
import H from './hyperHTML';

function Debug(text) {
    return H(Debug)`<div class=debug>${text}</div>`;
}

function Display(mode, rotate) {
    const style = {
        transition: 'all 0.5s ease',
        transform: `rotate(${rotate}deg)`,
    };
    return H(Display)`
    <div class=display style=${style}>${
        mode ? 'Portrait' : 'Landscape'
    }</div>`;
}

// consider lock only: what are the values from the sensor?
const sensor = init_rotation_sensor();

function update() {
    const {orientation: o, rotation: r} = sensor.sample();
    Debug(`o=${o} r=${r}`);

    let mode = 0;
    if (r === 0 || r === 2)
        mode = 1;

    let n = r;
    if (o === 0) {
    }
    else if (o === 1) {
        n += 3;
    }
    else if (o === 2) {
        n += 2;
    }
    else if (o === 3) {
        n += 1;
    }

    //const n = (r + (o+2)) % 4;
    const rotate = -(n%4) * 90;
    Display(mode, rotate);
}

setInterval(update, 200);

H(document.body)`
    ${Display(0, 0)}
    ${Debug()}
`;

document.body.addEventListener('touchend', e => {
    if ('fullscreenElement' in document) {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen(); 
        }
    }
    else if ('webkitFullscreenElement' in document) {
        if (!document.webkitFullscreenElement) {
            document.documentElement.webkitRequestFullscreen();
        } else
            document.webkitExitFullscreen(); 
    }
});
