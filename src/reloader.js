let ws;

function start_reloader() {
    ws = new WebSocket('ws://localhost:8001');
    ws.onopen = e => {
        console.log('reload:ws: open');
    };
    ws.onclose = e => {
        console.log('reload:ws: close');
    };
    ws.onerror = e => {
        console.log('reload:ws: error', e);
    };
    ws.onmessage = e => {
        const o = JSON.parse(e.data);
        console.log('reload:ws: message', o);
        dispatch(o);
    };
}

function dispatch({event, path, ext}) {
    switch (ext) {
    case '.js':
        window.location.reload();
        break;

    case '.css':
        const ss = find_stylesheet_by_path(path);
        ss && (ss.ownerNode.href = ss.ownerNode.href);
        break;

    default:
        console.log('reload: unhandled ', event, ext);
        break;
    }
}

function find_stylesheet_by_path(path) {
    const url = document.createElement('a');

    for (let i = 0; i < document.styleSheets.length; ++i) {
        var ss = document.styleSheets[i];
        if (!ss.href)
            continue;

        url.href = ss.href;
        if (url.pathname == path)
            return ss;
    }

    return null;
}

if (window.location.port == '8000')
    start_reloader();
