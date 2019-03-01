//const os = require('os');
//const fs = require('fs');
//const path = require('path');
//const chokidar = require('chokidar');

// body-parser
const body_parser = require('body-parser');
app.use(body_parser.json());
app.use(body_parser.urlencoded({ extended: true }));

// busboy
const busboy = require('connect-busboy');
const kilobyte = 1024;
const megabyte = 1024 * kilobyte;
const gigabyte = 1024 * megabyte;
const max_upload_size = 2 * gigabyte;
const uploader = busboy({ limits: { fileSize: max_upload_size } });

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

const port = 8000;
const local_ip = get_local_ip();
const local_url_base = `http://${local_ip}:${port}`;
console.log(local_url_base);

app.get('/server_info', (req, res) => {
    res.json({
        host: local_ip,
        port: port,
        url_base: local_url_base
    });
});

// http-proxy-middleware
const proxy = require('http-proxy-middleware');
app.use('/arnold', proxy({
    target: 'http://localhost:9123',
    changeOrigin: false,
    ws: true,
    pathRewrite: {
        '^/arnold': '/'
    },
}));

// server-sent-events
const sse = new ServerSentEvents();
app.get('/stream', sse.middleware.bind(sse), function(req, res) {
    res.send_json({ type: 'hello' });
    console.log('sse: connected', sse.connections.length);
});

// static media and listing
app.use('/api/media', express.static('media'));
app.get('/api/media', (req, res) => {
    fs.readdir('./media', (err, files) => {
        files = files.filter(f => f.endsWith('.jpg'));
        const dates = files.map(f => {
            const st = fs.statSync('./media/'+f);
            return st.mtime;
        });
        res.json({ files, dates });
    });
});

// chokidar
const watch_dir = './public';
console.log('watching:', watch_dir);
const watcher = chokidar.watch(watch_dir, {
    //ignored: /(^|[\/\\])\../,
    ignoreInitial: true,
});

watcher.on('ready', () => {
    // why doesn't this fire on miso??
    console.log('chokidar: ready');
});

watcher.on('all', (e, filepath) => {
    console.log(e);

    console.assert(filepath.startsWith(static_root));
    filepath = filepath.substr(static_root.length);

    const ext = path.extname(filepath);
    console.log(e.toUpperCase(), filepath);

    function match_ext(...exts) {
        for (let e of exts) {
            if (ext == '.'+e)
                return true;
        }
        return false;
    }

    if (match_ext('js', 'html', 'glsl')) {
        sse.send_json({ type: 'reload' });
        return;
    }

    if (match_ext('css', 'mpk')) {
        sse.send_json({ type: 'inject', path: filepath });
        return;
    }
});

// websocketserver
const wss = new WebSocket.Server({port:8001});
function wss_broadcast(msg) {
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

wss.on('connection', ws => {
    console.log('connect:', wss.clients.size);

    ws.on('close', function() {
        console.log('ws close', wss.clients.size);
    });

    ws.on('message', function(msg) {
        console.log('ws msg:', msg);

        // broadcast
        wss.clients.forEach(c => {
            if (c.readyState === WebSocket.OPEN)
                c.send(msg);
        });
    });

    ws.send(JSON.stringify({hello: 'world'}));
});
