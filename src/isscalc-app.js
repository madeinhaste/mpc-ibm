//import {addressPoints} from './marker_list';
import '@babel/polyfill';
import 'whatwg-fetch';

import {lerp, DEG2RAD} from './utils';

//const api_host = 'http://localhost:8888';
const api_host = 'https://cg.zigzag.site/iss';

// let's find london
let coords = {
    user: null,
    town: null,
    iss: null,
};

let iss_trail = [];

let colors = {
    user: '#f00',
    town: '#0f0',
    iss: '#08f',
    iss2: '#048',
};

let geoip = {
    city: '',
    ip: '',
    valid: false,
};

let marker = null;
let sightings = null;
let hours_until_overhead = 0;

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const img = document.querySelector('img.worldmap');

function redraw() {
    const rect = img.getBoundingClientRect();
    Object.assign(canvas.style, {
        position: 'absolute',
        left: rect.x + 'px',
        top: rect.y + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
    });

    const cw = canvas.width = rect.width;
    const ch = canvas.height = rect.height;
    ctx.clearRect(0, 0, cw, ch);

    ctx.save();
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 1;
    ctx.shadowColor = '#000';

    ctx.beginPath();
    iss_trail.forEach((co, idx) => {
        const x = (0.5 + co.lon/360) * cw;
        const y = (1-(0.5 + co.lat/180)) * ch;
        idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = colors.iss2;
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let [id, co] of Object.entries(coords)) {
        if (!co)
            continue;

        ctx.fillStyle = colors[id];

        const x = (0.5 + co.lon/360) * cw;
        const y = (1-(0.5 + co.lat/180)) * ch;
        const r = id == 'iss' ? 5 : 2;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2*Math.PI);
        ctx.fill();
    }
    ctx.restore();
}

function encode_query(params) {
    return params ?
        '?' + Object.entries(params).map(kv => kv.map(encodeURIComponent).join('=')).join('&') :
        '';
}

function api_get(path, params) {
    const url = `${api_host}/${path}${encode_query(params)}`;
    const opts = {
        mode: 'cors',
        headers: { 'Access-Control-Allow-Origin': '*', },
    };
    return fetch(url, opts).then(r => r.json());
}

function refresh_iss() {
    return api_get('iss').then(ob => {
        coords.iss = {lat: ob.lat, lon: ob.lon};
        iss_trail = ob.trail;
        redraw();
    });
}

setInterval(refresh_iss, 10000);
refresh_iss();

function update_debug() {
    const dbg = document.querySelector('.debug');
    const lines = [];

    lines.push(
        `Location: ${coords.user.lat.toFixed(3)}N ${coords.user.lon.toFixed(3)}E`,
    );

    if (geoip.valid) {
        lines.push(
            `IP: ${geoip.ip}`,
            `GeoIP: ${geoip.city}`
        );
    }

    if (marker) {
        lines.push(
            'Marker: ' + marker.label,
            'Timezone: ' + marker.timezone,
            'Distance: ' + marker.dist.toFixed(1) + 'km',
        );
    }

    if (sightings) {
        const now = new Date;
        let first = false;
        sightings.forEach(s => {
            const d = new Date(s.datetime);
            const utc = d.toUTCString();
            const delta_hr = ((d - now) / (1000 * 3600)).toFixed(1);
            //const t = `${d} | ${s.info.duration}`;
            let t = `${utc} | ${delta_hr}hr`;
            if (delta_hr > 0 && !first) {
                t = `<em>${t}</em>`;
                first = true;
            }
            lines.push(t);
        });
    }

    {
        lines.push(`--\nHOURS: ${hours_until_overhead}`);
    }

    dbg.innerHTML = lines.join('\n');
    redraw();
}

function set_user_coords(lat, lon) {
    coords.user = {lat, lon};

    api_get('marker', {lat, lon}).then(ob => {
        console.log(ob);
        coords.town = {lon: ob.lon, lat: ob.lat};
        marker = ob;
        update_debug();
    });

    api_get('sightings', {lat, lon}).then(ob => {
        sightings = ob.sightings;
        update_debug();
    });

    api_get('hours', {lat, lon}).then(ob => {
        hours_until_overhead = ob.h;
        update_debug();
    });

    redraw();
}

function load_geoip() {
    api_get('geoip').then(ob => {
        console.log(ob);
        geoip.ip = ob.ip;
        geoip.city = ob.city;
        geoip.valid = true;
        set_user_coords(ob.lat, ob.lon);
    });

    // this is the hours call
    api_get('hours').then(ob => {
        console.log(ob);
        hours_until_overhead = ob.h;
    });
}
load_geoip();

document.addEventListener('mousedown', function(e) {
    const rect = e.target.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    const lon = lerp(-180, 180, u);
    const lat = lerp(90, -90, v);
    geoip.valid = false;
    set_user_coords(lat, lon);
});

window.onresize = redraw;

function haversine(lat1, lon1, lat2, lon2) {
    const s1 = Math.sin(DEG2RAD * (lat2 - lat1)/2);
    const s2 = Math.sin(DEG2RAD * (lon2 - lon1)/2);
    const c1 = Math.cos(DEG2RAD * lat1);
    const c2 = Math.cos(DEG2RAD * lat2);
    const a = s1*s1 + s2*s2*c1*c2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return c;
}
