const express = require('express');
const morgan = require('morgan');
const path = require('path');
const os = require('os');

const app = express();
app.use(morgan('dev'));

const Debug = require('debug');
const debug = Debug('server');
const assert = console.assert;

const PORT = 8000;
const RELOADER_PORT = 8001;
const hostname = get_local_ip();
const url_base = `http://${hostname}:${PORT}`;

app.get('/server_info', (req, res) => {
    const hostname = get_local_ip();
    const scheme = 'http';
    const origin = `${scheme}://${hostname}:${PORT}`;

    res.json({
        hostname,
        port: PORT,
        origin,
    });
});

// static
const static_root = './public';
app.use(express.static(static_root, {
    extensions: ['html'],
}));

// rollup
{
    const debug = Debug('rollup');
    const rollup = require('rollup');
    // set to avoid production builds
    process.env.ROLLUP_WATCH = true;
    const config = require('../rollup.config.js');
    const watcher = rollup.watch(config);
    watcher.on('event', e => {
        debug('event', e.code);
    });
}

// chokidar
let reloader_broadcast;

{
    const debug = Debug('watcher');
    const chokidar = require('chokidar');
    debug('watching:', static_root);

    const watcher = chokidar.watch(static_root, {
        //ignored: /(^|[\/\\])\../,
        ignoreInitial: true,
    });

    watcher.on('ready', () => {
        debug('ready');
    });

    watcher.on('all', (event, filepath) => {
        // map filepath to url path
        const root = 'public';
        assert(filepath.startsWith(root));
        filepath = filepath.substr(root.length);

        //assert(filepath.startsWith(static_root);

        debug(event, filepath);
        // broadcast this
        reloader_broadcast({
            event,
            path: filepath,
            ext: path.extname(filepath),
        });
    });
}

// reload websocket
{
    const debug = Debug('reload:wss');
    const WebSocket = require('ws');
    const wss = new WebSocket.Server({port:RELOADER_PORT});

    function broadcast(msg) {
        msg = JSON.stringify(msg);
        let count = 0;
        wss.clients.forEach(c => {
            if (c.readyState === WebSocket.OPEN) {
                c.send(msg);
                ++count;
            }
        });
        return count;
    }
    reloader_broadcast = broadcast;

    wss.on('connection', ws => {
        debug('opened', wss.clients.size);

        ws.on('close', function() {
            debug('closed', wss.clients.size);
        });
    });
}

//const WebSocket = require('ws');
//const express_ws = require('express-ws')(app);

// mount api
app.use('/api', require('./api'));

app.listen(PORT, function() {
    debug(`listening on port ${PORT}`);
});

// server-info
function get_local_ip() {
    const details = os.networkInterfaces();
    for (let name in details) {
        for (let info of details[name]) {
            if (info.family == 'IPv4' &&
                info.internal == false)
            {
                return info.address;
            }
        }
    }
    return '0.0.0.0';
}
