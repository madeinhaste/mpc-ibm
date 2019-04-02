import {addressPoints} from './marker_list';
import {lerp, DEG2RAD} from './utils';
import moment from 'moment-timezone';
//import geo_tz from 'geo-tz';

//console.log(addressPoints);

// "Kabul, Afghanistan"
// 34.55 N
// 69.27 E
// None
// Afghanistan
// Kabul

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

/*
const re = /London/;
for (let i = 0; i < addressPoints.length; ++i) {
    const a = addressPoints[i];
    if (a[0].match(re)) {
        const co = {
            lat: a[1],
            lon: a[2],
        };
        console.log(co);
        cos.push(co);
    }
}
*/
//console.log(addressPoints.length);

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

    //ctx.fillStyle = 'rgba(255,0,0, 0.5)';
    //ctx.fillRect(0, 0, cw, ch/2);
}

function refresh_iss() {
    get_geoloc_iss().then(function(co) {
        coords.iss = co;
        iss_trail.push(co);
        redraw();
    });
}

setInterval(refresh_iss, 10000);
refresh_iss();

document.addEventListener('mousedown', function(e) {
    const rect = e.target.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    const lon = lerp(-180, 180, u);
    const lat = lerp(90, -90, v);
    coords.user = {lon, lat};

    // now find nearest
    {
        let best_idx = -1;
        let best_dist = Infinity;
        for (let idx = 0; idx < addressPoints.length; ++idx) {
            const ap = addressPoints[idx];
            const lat2 = ap[1];
            const lon2 = ap[2];

            const dist = haversine(lat, lon, lat2, lon2);
            if (dist < best_dist) {
                best_idx = idx;
                best_dist = dist;
            }
        }

        {
            const ap = addressPoints[best_idx];
            const lat2 = ap[1];
            const lon2 = ap[2];
            coords.town = {lon: lon2, lat: lat2};
            const earth_radius = 6371;
            const dist_km = earth_radius * best_dist;
            console.log(ap[0], dist_km.toFixed(1)+'km');

            //const tz = geo_tz(lat2, lon2);
            //console.log('timezone:', tz);
            //debugger;

            const dbg = document.querySelector('.debug');
            const lines = [
                `${lat.toFixed(3)}N ${lon.toFixed(3)}E`,
                ap[0],
                dist_km.toFixed(1) + 'km',
            ];
            dbg.innerHTML = lines.join('\n');

            const sts_id = `${ap[4]}_${ap[3]}_${ap[5]}`;
            console.log(sts_id);

            let url = `https://spotthestation.nasa.gov/sightings/xml_files/${sts_id}.xml`;
            url = 'https://cors-anywhere.herokuapp.com/' + url;
            //let url = 'data/example.xml';
            fetch(url, {
                    //mode: 'no-cors', // no-cors, cors, *same-origin
                    //headers: {'content-type': 'application/xml'},
                    //cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
                    //credentials: "same-origin", // include, *same-origin, omit
                })
                .then(r => r.text())
                .then(t => (new DOMParser).parseFromString(t, 'text/xml'))
                .then(xml => {
                    const dates = Array.from(xml.querySelectorAll('item description')).map(el => {
                        const lines = el.textContent.split('<br/>').map(s => s.trim());
                        const date = lines[0].match(/^Date: (.*)$/)[1];
                        const time = lines[1].match(/^Time: (.*)$/)[1];
                        //const dt = new Date(date + ' ' + time);
                        const dt = date + ' ' + time;
                        //console.log(date, time, dt);
                        return dt;
                    });

                    {
                        const url = `https://cg.zigzag.site/geo-tz?lat=${lat2}&lon=${lon2}`;
                        fetch(url, {
                            mode: 'cors',
                        }).then(r => r.json()).then(d => {
                            const timezone = d.timezones[0];
                            const now = new Date;
                            for (let i = 0; i < dates.length; ++i) {
                                let dt = dates[i];
                                let dt2 = (new Date(Date.parse(dt + ' UTC'))).toISOString().substr(0, 19);
                                const date = moment.tz(dt2, timezone);
                                const date_utc = date.toDate();
                                if (date_utc > now) {
                                    const diff = (date_utc - now) / (1000 * 60*60);
                                    const lines = [
                                        date.format('MMMM Do YYYY, h:mm:ss a') + ' ' + timezone,
                                        diff.toFixed(1) + 'hr'
                                    ];
                                    dbg.innerHTML += '\n' + lines.join('\n');
                                    //console.log('now:', now);
                                    //console.log('date:', date);
                                    //console.log('diff:', (date - now) / (1000 * 60*60));
                                    break;
                                }
                            }
                        });
                    }

                    /*
                    const now = new Date;
                    let first;
                    for (let i = 0; i < dates.length; ++i) {
                        if (dates[i] > now) {
                            first = dates[i];
                            break;
                        }
                    }

                    console.log('first:', first);
                    console.log('now:', now);

                    let lines = [];
                    if (first) {
                        const url = `http://localhost:9123/geotz/?lat=${lat2}&lon=${lon2}&datetime=${first}`;
                        fetch(url)
                            .then(r => r.json())
                            .then(d => {
                                console.log(d);
                            });

                        const diff = (first - now) / (1000 * 60 * 60);
                        console.log(diff.toFixed(1) + 'hr');
                        lines = [
                            first,
                            diff.toFixed(1) + 'hr'
                        ];
                    } else {
                        lines = [
                            'no sightings found',
                        ];
                        dbg.innerHTML += '\n' + lines.join('\n');
                    }
                    */

                });
            
        }
    }

    redraw();
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

function get_geoloc_iss() {
    //const url = 'http://api.open-notify.org/iss-now.json';
    const url = 'https://cg.zigzag.site/open-notify/iss-now.json';
    return fetch(url)
        .then(r => r.json())
        .then(ob => {
            const p = ob.iss_position;
            return {lat: +p.latitude, lon: +p.longitude};
        });
}

