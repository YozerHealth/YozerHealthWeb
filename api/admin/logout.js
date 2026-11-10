'use strict';
const { logout } = require('../../lib/admin-api');
module.exports = async function (req, res) { logout(req, res); };
