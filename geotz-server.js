const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const os = require('os');

const app = express();
app.use(morgan('dev'));
app.use(cors());

const Debug = require('debug');
const debug = Debug('server');
const assert = console.assert;

const geo_tz = require('geo-tz');
geo_tz.preCache();

const PORT = 9123;

app.get('/', (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const tzs = geo_tz(lat, lon);
    res.json({
        lat: lat,
        lon: lon,
        timezones: tzs,
    });
});

app.listen(PORT, function() {
    debug(`listening on port ${PORT}`);
});
