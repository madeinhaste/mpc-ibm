const api_host = 'https://cg.zigzag.site/iss';

function encode_query(params) {
    return params ?
        '?' + Object.entries(params).map(kv => kv.map(encodeURIComponent).join('=')).join('&') :
        '';
}

export function api_get(path, params) {
    const url = `${api_host}/${path}${encode_query(params)}`;
    const opts = {
        mode: 'cors',
        headers: { 'Access-Control-Allow-Origin': '*', },
    };
    return fetch(url, opts).then(r => r.json());
}
