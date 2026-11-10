'use strict';
/**
 * GET /api/download?variant=release|debug  （由 vercel.json 改写 /download/:variant 而来）
 * 记录一次下载事件（best-effort 云库），随后 302 重定向到 Vercel 静态资源
 * public/apks/<file>，由 CDN 提供断点续传（Accept-Ranges）。
 * 即使云库不可用，下载本身不受影响。
 */
const APP = require('../lib/app');
const { buildEvent } = require('../lib/analytics');
const getCloud = require('../lib/cloud-lazy');

function variantFromReq(req) {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  return u.searchParams.get('variant')
    || u.pathname.split('/').filter(Boolean).pop()
    || '';
}

module.exports = async function (req, res) {
  const variant = variantFromReq(req);
  const v = APP.variants[variant];
  if (!v) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }

  const store = getCloud();
  if (store) {
    const cookies = req.headers.cookie || '';
    const m = cookies.match(/(?:^|;\s*)yh_vid=([^;]+)/);
    try {
      await store.appendEvent(buildEvent(req, {
        type: 'download',
        variant,
        vid: m ? m[1] : '',
        page: '/download'
      }));
    } catch (err) {
      console.error('[cloud] 下载事件写入失败：' + (err && (err.cloudCode || err.message)));
    }
  }

  res.writeHead(302, {
    'Location': '/apks/' + encodeURIComponent(v.file),
    'Cache-Control': 'no-store'
  });
  res.end();
};
