'use strict';
const { session } = require('../../lib/admin-api');
module.exports = async function (req, res) { session(req, res); };
