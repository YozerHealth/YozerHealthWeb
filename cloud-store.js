'use strict';
/**
 * 官网访问 / 下载事件的云存储适配层。
 *
 * 真实事件写入 WorkBuddy 云数据库的 public.site_events（append-only，只有 INSERT/SELECT 策略，
 * 不开放 UPDATE/DELETE）；演示数据仍由服务端本地文件生成，与真实数据严格隔离。
 * 表里只保存脱敏后的 IP 与匿名访客标识，不含任何可识别个人身份的字段。
 *
 * 所有失败都抛带 isCloudError 的 Error，由 server.js 转成明确的 503 响应，
 * 绝不静默回退到本地 JSONL 或把失败当成功处理。
 */
const { cloud } = require('./cloud');

const TABLE = 'site_events';
const FIELDS = [
  'ts', 'type', 'variant', 'vid', 'page', 'referrer',
  'os', 'device', 'browser', 'ua', 'ip', 'hour', 'region', 'demo'
];
const PAGE_SIZE = 1000;
const MAX_ROWS = 100000;

/** 把云端错误码翻译成用户可理解的提示，不暴露内部端点、环境 ID 或原始堆栈 */
function friendly(code, status) {
  const c = String(code || '');
  if (/PGRST205|42P01/.test(c)) return '云数据库表尚未创建，请联系管理员初始化';
  if (/42501|EMPTY_RESULT/.test(c) || status === 403) return '云数据库写入被拒绝，请检查表授权与行级安全策略';
  if (/401|MISSING_CREDENTIALS|ACCESS_TOKEN/i.test(c) || status === 401) return '云服务凭据无效或环境未启用';
  if (/QUOTA|RATE|429|OVERLOAD/i.test(c) || status === 429) return '云服务配额或调用频率已达上限';
  return '云服务暂时不可用，请稍后重试';
}

function fail(op, res) {
  const raw = res && res.error;
  const code = (raw && (raw.code || raw.message)) || 'UNKNOWN';
  const e = new Error(op + '：' + friendly(code, res && res.status));
  e.isCloudError = true;
  e.cloudCode = String(code).slice(0, 120);
  return e;
}

function wrapNetwork(op, err) {
  const e = new Error(op + '：网络请求失败，云服务暂时不可用');
  e.isCloudError = true;
  e.cloudCode = 'NETWORK';
  e.causeMessage = err && err.message;
  return e;
}

/** 只保留表中存在的列，避免多余字段触发 PostgREST schema cache 报错 */
function pick(evt) {
  const row = {};
  for (const k of FIELDS) {
    const v = evt[k];
    row[k] = v === undefined ? null : v;
  }
  return row;
}

async function appendEvent(evt) {
  let res;
  try {
    res = await cloud.database.from(TABLE).insert(pick(evt)).select('id');
  } catch (err) {
    throw wrapNetwork('写入访问事件', err);
  }
  if (!res || res.error) throw fail('写入访问事件', res);
  const rows = Array.isArray(res.data) ? res.data : [];
  if (!rows.length) throw fail('写入访问事件', { error: { code: 'EMPTY_RESULT' } });
  return rows[0].id;
}

/** 分页读取真实事件；数据量在官网规模下远小于 MAX_ROWS */
async function readEvents() {
  const out = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let res;
    try {
      res = await cloud.database.from(TABLE)
        .select(FIELDS.join(','))
        .order('ts', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
    } catch (err) {
      throw wrapNetwork('读取访问事件', err);
    }
    if (!res || res.error) throw fail('读取访问事件', res);
    const rows = Array.isArray(res.data) ? res.data : [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** 供后台「云服务状态」接口做真实连通性探测 */
async function health() {
  let res;
  try {
    res = await cloud.database.from(TABLE).select('id').limit(1);
  } catch (err) {
    return { ok: false, error: wrapNetwork('云服务连通性检查', err).message };
  }
  if (!res || res.error) return { ok: false, error: fail('云服务连通性检查', res).message };
  return { ok: true, table: TABLE, mode: 'cloud-database' };
}

module.exports = { appendEvent, readEvents, health, TABLE };
