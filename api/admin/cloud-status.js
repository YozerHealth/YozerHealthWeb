'use strict';
const { cloudStatus } = require('../../lib/admin-api');
module.exports = async function (req, res) { await cloudStatus(req, res); };
