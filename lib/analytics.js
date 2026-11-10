'use strict';
/**
 * 纯函数分析 / 工具层（零依赖，供 Vercel api/ 函数独立使用）。
 * 与本地 server.js 中的同名逻辑保持一致，但去除对 config / fs 的耦合，
 * 仅依赖请求对象与传入参数，便于在 Serverless 环境复用。
 */
const crypto = require('node:crypto');

// 与前端共用同一份词典，避免服务端另立一套译法。
const I18N_DICT = require('../public/assets/i18n-dict.js');
function tr(zh, lang) {
  if (lang !== 'en') return zh;
  const v = I18N_DICT[zh];
  return v === undefined ? zh : v;
}
function wantEn(req) {
  return /^en\b/i.test(String(req.headers['accept-language'] || ''));
}
function loc(req, zh, en) { return wantEn(req) ? en : zh; }

// ---------------------------------------------------------------- 请求工具
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const xf = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf;
  }
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '') || 'unknown';
}

function maskIp(ip) {
  if (!ip || ip === 'unknown') return '—';
  if (ip.includes('.')) {
    const p = ip.split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.*.*` : ip;
  }
  return ip.split(':').slice(0, 3).join(':') + ':*';
}

function clip(v, n = 160) {
  return typeof v === 'string' ? v.slice(0, n) : '';
}

function parseUA(ua) {
  const u = String(ua || '').toLowerCase();
  let os = '其他';
  let device = '其他';
  let browser = '其他';
  if (/android/.test(u)) {
    os = 'Android';
    device = /mobile/.test(u) ? '手机' : '平板';
  } else if (/iphone|ipod|ipad/.test(u)) {
    os = 'iOS';
    device = /ipad/.test(u) ? '平板' : '手机';
  } else if (/windows/.test(u)) {
    os = 'Windows';
    device = '电脑';
  } else if (/macintosh|mac os x/.test(u)) {
    os = 'macOS';
    device = '电脑';
  } else if (/linux/.test(u)) {
    os = 'Linux';
    device = '电脑';
  }
  if (/micromessenger/.test(u)) browser = '微信内置';
  else if (/edg\//.test(u)) browser = 'Edge';
  else if (/chrome|crios/.test(u)) browser = 'Chrome';
  else if (/safari/.test(u)) browser = 'Safari';
  else if (/firefox|fxios/.test(u)) browser = 'Firefox';
  else if (/curl|python|okhttp|postman|wget/.test(u)) browser = '程序/脚本';
  return { os, device, browser };
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('JSON 格式错误'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj, headers = {}) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

// ---------------------------------------------------------------- 事件构建
function buildEvent(req, { type, variant = null, vid = '', page = '', referrer = '', extra = {} }) {
  const ua = req.headers['user-agent'] || '';
  const parsed = parseUA(ua);
  const ts = Date.now();
  const d = new Date(ts);
  return {
    ts,
    type,
    variant,
    vid: clip(vid, 64),
    page: clip(page, 160),
    referrer: clip(referrer, 200),
    ...parsed,
    ua: clip(ua, 300),
    ip: maskIp(clientIp(req)), // 只保存脱敏 IP，原始地址不落盘、不上传
    hour: d.getHours(),
    region: null, // 未接入 IP 归属库，真实数据不做估算填充
    demo: false,
    ...extra
  };
}

// ---------------------------------------------------------------- 统计聚合
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function countBy(list, field) {
  const m = new Map();
  for (const e of list) {
    const k = e[field] || '未知';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function pct(cur, prev) {
  if (!prev) return cur ? null : 0; // 上期为 0 时不编造增长率
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function aggregate(events, days, demo) {
  const now = Date.now();
  const DAY = 86400000;
  const from = now - days * DAY;
  const cur = events.filter((e) => e.ts >= from && e.ts <= now);
  const prev = events.filter((e) => e.ts >= from - days * DAY && e.ts < from);

  const visits = cur.filter((e) => e.type === 'visit');
  const downloads = cur.filter((e) => e.type === 'download');
  const uv = new Set(visits.map((e) => e.vid).filter(Boolean)).size;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const downloadsToday = downloads.filter((e) => e.ts >= today.getTime()).length;
  const visitsToday = visits.filter((e) => e.ts >= today.getTime()).length;

  const prevVisits = prev.filter((e) => e.type === 'visit').length;
  const prevDownloads = prev.filter((e) => e.type === 'download').length;

  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY);
    buckets.set(key, { date: key, label: key.slice(5), visits: 0, downloads: 0 });
  }
  for (const e of cur) {
    const b = buckets.get(dayKey(e.ts));
    if (!b) continue;
    if (e.type === 'visit') b.visits += 1;
    else if (e.type === 'download') b.downloads += 1;
  }

  const hours = new Array(24).fill(0);
  for (const e of visits) if (Number.isInteger(e.hour) && e.hour >= 0 && e.hour < 24) hours[e.hour] += 1;

  const regions = countBy(cur.filter((e) => e.region), 'region');

  const recent = [...cur]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 120)
    .map((e) => ({
      ts: e.ts,
      type: e.type,
      variant: e.variant,
      os: e.os,
      device: e.device,
      browser: e.browser,
      ip: maskIp(e.ip),
      region: e.region || '',
      page: e.page || ''
    }));

  return {
    generatedAt: new Date().toISOString(),
    source: demo ? 'demo' : 'live',
    note: demo
      ? '演示数据：由系统生成的示例事件，不代表真实访问'
      : '真实数据：来自本站服务端记录的访问与下载事件',
    range: { days, from: new Date(from).toISOString(), to: new Date(now).toISOString() },
    kpi: {
      pv: visits.length,
      uv,
      downloads: downloads.length,
      downloadsToday,
      visitsToday,
      conversion: visits.length ? Math.round((downloads.length / visits.length) * 1000) / 10 : 0,
      pvDelta: pct(visits.length, prevVisits),
      downloadDelta: pct(downloads.length, prevDownloads)
    },
    trend: [...buckets.values()],
    devices: countBy(visits, 'device'),
    platforms: countBy(visits, 'os'),
    browsers: countBy(visits, 'browser'),
    hours,
    variants: countBy(downloads, 'variant'),
    regions,
    geoAvailable: regions.length > 0,
    geoNote: regions.length
      ? ''
      : '未接入 IP 归属库，真实数据不提供地域推断。可在 config 中扩展 region 字段后自动启用。',
    recent,
    totalEvents: events.length
  };
}

// ---------------------------------------------------------------- CSV
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function eventsToCsv(events, lang) {
  const en = lang === 'en';
  const head = en
    ? ['Time', 'Event', 'Downloaded version', 'Device', 'OS', 'Browser', 'IP (masked)', 'Region', 'Page', 'Referrer']
    : ['时间', '事件类型', '下载版本', '设备', '系统', '浏览器', 'IP(脱敏)', '地域', '页面', '来源'];
  const rows = events
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map((e) => [
      new Date(e.ts).toLocaleString(en ? 'en-US' : 'zh-CN', { hour12: false }),
      e.type === 'download' ? (en ? 'Download' : '下载') : (en ? 'Visit' : '访问'),
      e.variant || '',
      tr(e.device || '', lang), tr(e.os || '', lang), tr(e.browser || '', lang),
      maskIp(e.ip), tr(e.region || '', lang), e.page || '', e.referrer || ''
    ]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

// ---------------------------------------------------------------- 演示数据（内存生成，不落盘）
function generateDemoEvents(days = 30) {
  const provinces = ['广东', '北京', '上海', '浙江', '江苏', '四川', '山东', '湖北', '湖南', '河南', '福建', '陕西', '其他'];
  const browsers = ['Chrome', 'Edge', '微信内置', 'Safari', 'Firefox'];
  const osList = ['Android', 'Android', 'Android', 'iOS', 'Windows', 'macOS'];
  const now = Date.now();
  const DAY = 86400000;
  const out = [];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const vids = Array.from({ length: 460 }, () => crypto.randomBytes(6).toString('hex'));

  for (let d = days - 1; d >= 0; d--) {
    const base = new Date(now - d * DAY);
    base.setHours(0, 0, 0, 0);
    const weekend = [0, 6].includes(base.getDay());
    const visitCount = 26 + Math.floor(Math.random() * 34) + (weekend ? 9 : 0) - (d > days - 8 ? 5 : 0);
    const downloadCount = 6 + Math.floor(Math.random() * 13) + (d % 7 === 0 ? 6 : 0);

    const emit = (type, variant) => {
      const hour = Math.random() < 0.82
        ? 8 + Math.floor(Math.random() * 15)
        : Math.floor(Math.random() * 24);
      const ts = base.getTime() + hour * 3600000 + Math.floor(Math.random() * 3600000);
      if (ts > now) return;
      const os = pick(osList);
      out.push({
        ts, type, variant,
        vid: pick(vids),
        page: type === 'download' ? '/download' : '/',
        referrer: Math.random() < 0.3 ? 'https://example.com/' : '',
        os,
        device: os === 'Android' || os === 'iOS' ? (Math.random() < 0.85 ? '手机' : '平板') : '电脑',
        browser: pick(browsers),
        ua: 'DEMO-UA',
        ip: `203.0.113.${1 + Math.floor(Math.random() * 250)}`,
        hour,
        region: pick(provinces),
        demo: true
      });
    };

    for (let i = 0; i < Math.max(0, visitCount); i++) emit('visit', null);
    for (let i = 0; i < downloadCount; i++) emit('download', Math.random() < 0.84 ? 'release' : 'debug');
  }
  return out;
}

module.exports = {
  tr, wantEn, loc,
  parseCookies, clientIp, maskIp, clip, parseUA,
  readBody, sendJson, sendHtml,
  buildEvent, dayKey, countBy, pct, aggregate,
  csvEscape, eventsToCsv,
  generateDemoEvents
};
