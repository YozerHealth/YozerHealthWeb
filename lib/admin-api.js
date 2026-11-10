'use strict';
/**
 * 管理后台各接口的实现（被 api/admin/*.js 复用）。
 * 鉴权基于签名 Cookie（lib/admin）；真实统计读写云数据库（best-effort）；
 * 演示数据内存生成，不落盘（Serverless 只读文件系统友好）。
 */
const { aggregate, eventsToCsv, generateDemoEvents, readBody, sendJson, sendHtml, loc } = require('./analytics');
const { authOk, signToken, verifyCredentials } = require('./admin');
const getCloud = require('./cloud-lazy');

function parseQuery(req) {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  return u.searchParams;
}

// ---------------------------------------------------------------- 登录
async function login(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: 'JSON 格式错误' }));
  }
  const ok = verifyCredentials(String(body.username || ''), String(body.password || ''));
  if (!ok) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: '账号或密码不正确' }));
  }
  const token = signToken({ username: body.username || 'admin', exp: Date.now() + 2 * 3600000 });
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': `yh_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200`
  });
  res.end(JSON.stringify({ ok: true }));
}

// ---------------------------------------------------------------- 会话
function session(req, res) {
  const authed = authOk(req);
  const token = require('./admin').cookieToken(req);
  let username = '';
  if (authed && token) {
    try { username = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')).username || ''; } catch {}
  }
  sendJson(res, 200, { ok: true, authenticated: authed, username });
}

// ---------------------------------------------------------------- 登出
function logout(req, res) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': 'yh_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
  });
  res.end(JSON.stringify({ ok: true }));
}

// ---------------------------------------------------------------- 读事件（演示 / 真实）
async function loadEvents({ demo, days }) {
  if (demo) return generateDemoEvents(days);
  const store = getCloud();
  if (!store) return { unavailable: true, events: [] };
  try {
    const events = await store.readEvents();
    return { unavailable: false, events };
  } catch (err) {
    console.error('[cloud] 统计读取失败：' + (err && (err.cloudCode || err.message)));
    return { unavailable: true, events: [], error: err && (err.cloudCode || err.message) };
  }
}

// ---------------------------------------------------------------- 统计
async function stats(req, res) {
  if (!authOk(req)) return sendJson(res, 401, { ok: false, error: '未登录或会话已过期' });
  const q = parseQuery(req);
  const days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  const demo = q.get('demo') === '1';
  const { unavailable, events, error } = await loadEvents({ demo, days });
  if (unavailable && !demo) {
    const data = aggregate([], days, false);
    return sendJson(res, 200, {
      ok: true,
      storage: 'cloud-unavailable',
      ...data,
      note: '云服务暂未启用或不可达，当前无真实统计数据。请在 Vercel 环境变量中配置云服务凭据，或确认 SDK 已安装。'
    });
  }
  if (unavailable && demo) {
    // 演示数据内存生成，不会进入此分支；保险处理
    return sendJson(res, 503, { ok: false, error: error || '云数据库读取失败' });
  }
  sendJson(res, 200, { ok: true, storage: demo ? 'local-demo' : 'cloud-database', ...aggregate(events, days, demo) });
}

// ---------------------------------------------------------------- CSV 导出
async function exportCsv(req, res) {
  if (!authOk(req)) {
    return sendHtml(res, 401, loc(req, '<h1>请先登录</h1>', '<h1>Please sign in first</h1>'));
  }
  const q = parseQuery(req);
  const days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30;
  const demo = q.get('demo') === '1';
  const lang = q.get('lang') === 'en' ? 'en' : 'zh';
  const { unavailable, events, error } = await loadEvents({ demo, days });
  if (unavailable && !demo) {
    return sendHtml(res, 503, loc(req,
      '<h1>云服务暂时不可用</h1><p>' + (error || '未配置云服务') + '</p>',
      '<h1>Cloud service unavailable</h1><p>' + (error || 'Cloud not configured') + '</p>'));
  }
  const from = Date.now() - days * 86400000;
  const body = Buffer.from(eventsToCsv(events.filter((e) => e.ts >= from), lang), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Length': body.length,
    'Content-Disposition': `attachment; filename="yozerhealth-stats-${demo ? 'demo-' : ''}${days}d.csv"`
  });
  res.end(body);
}

// ---------------------------------------------------------------- 演示数据开关
async function demo(req, res) {
  if (!authOk(req)) return sendJson(res, 401, { ok: false, error: '未登录或会话已过期' });
  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, error: 'JSON 格式错误' });
  }
  if (body.action === 'load') {
    const count = generateDemoEvents(30).length;
    return sendJson(res, 200, { ok: true, action: 'load', count });
  }
  if (body.action === 'clear') {
    return sendJson(res, 200, { ok: true, action: 'clear', count: 0 });
  }
  return sendJson(res, 400, { ok: false, error: '未知操作' });
}

// ---------------------------------------------------------------- 云状态
async function cloudStatus(req, res) {
  if (!authOk(req)) return sendJson(res, 401, { ok: false, error: '未登录或会话已过期' });
  const store = getCloud();
  if (!store) {
    return sendJson(res, 200, { ok: false, mode: 'unavailable', table: '', error: '云服务 SDK 未安装或未配置' });
  }
  try {
    const status = await store.health();
    return sendJson(res, status.ok ? 200 : 503, {
      ok: status.ok,
      mode: status.mode || 'unavailable',
      table: status.table || store.TABLE,
      error: status.error || ''
    });
  } catch (err) {
    return sendJson(res, 503, { ok: false, mode: 'error', table: store.TABLE, error: err && (err.cloudCode || err.message) });
  }
}

module.exports = { login, session, logout, stats, exportCsv, demo, cloudStatus };
