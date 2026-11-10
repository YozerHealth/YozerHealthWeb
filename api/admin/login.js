'use strict';
const { login } = require('../../lib/admin-api');
module.exports = async function (req, res) { await login(req, res); };
