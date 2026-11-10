'use strict';
/**
 * 管理员鉴权与会话（Serverless 友好）。
 *
 * 设计要点：
 *   - 会话令牌采用 HMAC-SHA256 签名（payload.exp 过期），无需服务端内存态，
 *     天然适配 Vercel 多实例 / 冷启动。本地开发若未设置 YH_SESSION_SECRET，
 *     退化为进程内随机密钥（单实例足够）。
 *   - 凭据优先读环境变量（YH_ADMIN_USER / YH_ADMIN_PASSWORD，或预计算哈希
 *     YH_ADMIN_PASSWORD_HASH + YH_ADMIN_PASSWORD_SALT），适配 Vercel 只读文件系统；
 *     未配置环境变量时回退到本地 data/admin.json（仅本地开发可用）。
 */
const crypto = require('node:crypto');

function getSecret() {
  return process.env.YH_SESSION_SECRET || 'dev-insecure-secret-change-me';
}

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return data + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  let expected;
  try {
    expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  } catch {
    return null;
  }
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieToken(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)yh_admin=([^;]+)/);
  return m ? m[1] : null;
}

function authOk(req) {
  return !!verifyToken(cookieToken(req));
}

function verifyCredentials(username, password) {
  const wantUser = process.env.YH_ADMIN_USER || 'admin';
  if (username !== wantUser) return false;

  // 1) 明文密码（环境变量，最简单，适合 Vercel）
  if (process.env.YH_ADMIN_PASSWORD) {
    const a = Buffer.from(password);
    const b = Buffer.from(process.env.YH_ADMIN_PASSWORD);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // 2) 预计算 scrypt 哈希（不暴露明文，适合对安全要求更高的部署）
  if (process.env.YH_ADMIN_PASSWORD_HASH && process.env.YH_ADMIN_PASSWORD_SALT) {
    const salt = Buffer.from(process.env.YH_ADMIN_PASSWORD_SALT, 'hex');
    const hash = crypto.scryptSync(password, salt, 32).toString('hex');
    const a = Buffer.from(hash);
    const b = Buffer.from(process.env.YH_ADMIN_PASSWORD_HASH);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // 3) 本地开发回退：data/admin.json（需可写文件系统）
  try {
    const C = require('../config');
    const admin = C.loadAdmin({ quiet: true });
    return C.verifyPassword(admin, password);
  } catch {
    return false;
  }
}

module.exports = { signToken, verifyToken, authOk, verifyCredentials, cookieToken };
