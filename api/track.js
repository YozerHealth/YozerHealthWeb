'use strict';
/**
 * POST /api/track —— 记录访问 / 下载事件（仅 visit / download 两类）。
 * 若有云服务 SDK 则写入云数据库；否则静默降级，始终返回 ok:true，
 * 避免前端因统计失败而弹出告警（统计是增强项，不是页面核心）。
 */
const { buildEvent, readBody } = require('../lib/analytics');
const getCloud = require('../lib/cloud-lazy');

// 轻量内存去重（仅在热实例内有效，冷启动会重置；用于抑制刷新/预加载虚高）
const guard = new Map();
function dedup(key, windowMs) {
  const now = Date.now();
  const rec = guard.get(key);
  if (!rec || rec.reset < now) {
    guard.set(key, { reset: now + windowMs });
    return false;
  }
  return true;
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: '方法不允许' }));
  }
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: 'JSON 格式错误' }));
  }
  const type = body.type;
  if (type !== 'visit' && type !== 'download') {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: '不支持的事件类型' }));
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket.remoteAddress || '').replace(/^::ffff:/, '') || 'unknown';
  const guardKey = 'track:' + ip + ':' + (body.vid || '');
  // 仅在完整访问上报时做去重；下载事件一律记录
  if (type === 'visit' && dedup(guardKey, 8000)) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, dedup: true, cloud: false }));
  }

  // 先返回响应，云写入放到后台异步进行（带超时保护）。
  // 统计是增强项，绝不能因云慢/不可达而阻塞页面或埋点响应本身。
  const store = getCloud();
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ok: true, cloud: !!store }));

  if (store) {
    Promise.race([
      store.appendEvent(buildEvent(req, {
        type,
        vid: body.vid || '',
        page: body.page || '',
        referrer: body.referrer || ''
      })),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error('cloud-write-timeout')); }, 1500); })
    ]).catch(function (err) {
      console.error('[cloud] 事件写入失败：' + (err && (err.cloudCode || err.message)));
    });
  }
};
