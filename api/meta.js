'use strict';
/**
 * GET /api/meta —— 返回应用元信息与 APK 静态可用性。
 * 不依赖云服务：APK 作为 Vercel 静态资源（public/apks/）提供，函数仅做存在性探测。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const APP = require('../lib/app');
const getCloud = require('../lib/cloud-lazy');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const apkCache = {}; // file -> { stamp, sha }

function shaFor(file, st) {
  const stamp = st.size + ':' + st.mtimeMs;
  if (apkCache[file] && apkCache[file].stamp === stamp) return apkCache[file].sha;
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
  apkCache[file] = { stamp, sha };
  return sha;
}

function computeVariants() {
  const out = {};
  for (const [key, v] of Object.entries(APP.variants)) {
    const file = path.join(PUBLIC_DIR, 'apks', v.file);
    const info = { ...v, available: false, size: 0, sha256: '', updatedAt: '' };
    try {
      const st = fs.statSync(file);
      info.available = true;
      info.size = st.size;
      info.updatedAt = st.mtime.toISOString();
      info.sha256 = shaFor(file, st);
    } catch (_) { /* 文件未部署则标记不可用，前端自动禁用对应下载按钮 */ }
    out[key] = info;
  }
  return out;
}

module.exports = async function (req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: '方法不允许' }));
  }
  const variants = computeVariants();
  const cloud = getCloud();
  const appInfo = {
    name: APP.name, nameEn: APP.nameEn, fullName: APP.fullName,
    version: APP.version, versionCode: APP.versionCode,
    packageName: APP.packageName, minSdk: APP.minSdk, targetSdk: APP.targetSdk,
    androidLabel: APP.androidLabel, abi: APP.abi,
    feedbackEmail: APP.feedbackEmail, feedbackWechat: APP.feedbackWechat,
    disclaimer: APP.disclaimer
  };
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify({
    ok: true,
    app: appInfo,
    variants,
    cloud: { enabled: !!cloud, events: cloud ? 'cloud-database' : 'local-none' }
  }));
};
