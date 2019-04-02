    function Geoloc(lat, lon) {
        this.lat = lat;
        this.lon = lon;
    }


const DEG2RAD = Math.PI/180;

function haversine2(lat1, lon1, lat2, lon2) {
    const s1 = Math.sin(DEG2RAD * (lat2 - lat1)/2);
    const s2 = Math.sin(DEG2RAD * (lon2 - lon1)/2);
    const c1 = Math.cos(DEG2RAD * lat1);
    const c2 = Math.cos(DEG2RAD * lat2);
    const a = s1*s1 + s2*s2*c1*c2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return c;
}

const user = new Geoloc(51.547, -0.134);        // cantelowes

function calc_time_to_overhead(user, iss) {
    const earth_radius = 6371;
    const iss_altitude = 408;
    const iss_orbit_radius = earth_radius + iss_altitude;
    const iss_oribtal_velocity_m_per_s = 7660;

    const dist = iss_orbit_radius * haversine2(
        user.lat, user.lon,
        iss.lat, iss.lon);
    const time_to_user_s = (1000 * dist) / iss_oribtal_velocity_m_per_s;
    const time_to_user_h = time_to_user_s / (60 * 60);
    return time_to_user_h;
}

function lerp(a, b, x) {
    return (1-x)*a + x*b;
}

let t0 = 100;
let t1 = 0;

for (let i = 0; i < 1000000; ++i) {
    const lat = lerp(-90, 90, Math.random());
    const lon = lerp(-180, 180, Math.random());
    const iss = new Geoloc(lat, lon);

    const t = calc_time_to_overhead(user, iss);
    t0 = Math.min(t0, t);
    t1 = Math.max(t1, t);
}
console.log(t0, t1);
