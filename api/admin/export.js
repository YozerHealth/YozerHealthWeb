'use strict';
// 路径 /api/admin/export.csv 由 vercel.json 改写为 /api/admin/export?format=csv
const { exportCsv } = require('../../lib/admin-api');
module.exports = async function (req, res) { await exportCsv(req, res); };
