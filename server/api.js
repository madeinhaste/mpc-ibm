const express = require('express');
const api = express();

api.get('/hello', (req, res) => {
    res.send({ message: 'hello, world.' });
});

module.exports = api;
