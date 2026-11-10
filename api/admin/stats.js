'use strict';
const { stats } = require('../../lib/admin-api');
module.exports = async function (req, res) { await stats(req, res); };
