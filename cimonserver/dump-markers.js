// https://spotthestation.nasa.gov/js/marker_list.js
const points = require('./marker_list.js');
const geo_tz = require('geo-tz');
geo_tz.preCache();

const out = [];
points.forEach(p => {
    const ob = {
        label: p[0],
        lat: p[1],
        lon: p[2],
        country: p[4],
        state: p[3],
        town: p[5],
        timezone: '',
    };

    const timezones = geo_tz(ob.lat, ob.lon);
    console.assert(timezones.length > 0);
    ob.timezone = timezones[0];
    out.push(ob);
});

console.log(JSON.stringify(out, null, 4));
