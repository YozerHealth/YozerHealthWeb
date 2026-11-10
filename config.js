'use strict';
/**
 * 悦泽健康官网 / 管理后台 —— 运行时配置
 * 零外部依赖，仅使用 Node.js 内置模块。
 */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PROJECT_ROOT = path.resolve(ROOT, '..');

const PORT = Number(process.env.PORT || 8788);
// 云端发布平台会注入 PORT，此时必须绑定 0.0.0.0 才能被反向代理访问；
// 本地开发未注入 PORT 时保持仅本机可访问，避免意外暴露。
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');

/**
 * APK 目录解析（服务器部署包自带安装包，解压即可提供下载）：
 *   1) 环境变量 APK_DIR       —— 运维把安装包放在独立挂载盘时使用
 *   2) 部署包内 apks/         —— 服务器发布版，自包含，优先命中
 *   3) 项目 dist/             —— 本地开发版，保持原有行为
 * 只有「目录存在且含 .apk」才采用包内目录，避免空目录让下载页 404。
 */
const BUNDLED_APK_DIR = path.join(ROOT, 'apks');
const DEV_APK_DIR = path.join(PROJECT_ROOT, 'dist');
function dirHasApk(dir) {
  try {
    return fs.readdirSync(dir).some((n) => n.toLowerCase().endsWith('.apk'));
  } catch (_) {
    return false;
  }
}
let APK_SOURCE = 'env';
let APK_DIR = process.env.APK_DIR ? path.resolve(process.env.APK_DIR) : null;
if (!APK_DIR) {
  if (dirHasApk(BUNDLED_APK_DIR)) {
    APK_DIR = BUNDLED_APK_DIR;
    APK_SOURCE = 'bundled';
  } else {
    APK_DIR = DEV_APK_DIR;
    APK_SOURCE = 'dev';
  }
}
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const DEMO_FILE = path.join(DATA_DIR, 'demo-events.jsonl');

/** 应用元信息：全部取自 V1.0.0 真实构建产物，网站前台通过 /api/meta 读取 */
const APP = {
  name: '悦泽健康',
  nameEn: 'YozerHealth',
  fullName: '悦泽健康家庭健康档案管理软件',
  version: '1.0.0',
  versionCode: 23,
  packageName: 'com.healthkeeper.app',
  minSdk: 26,
  targetSdk: 36,
  androidLabel: 'Android 8.0 及以上',
  abi: 'arm64-v8a',
  feedbackEmail: 'YozerHealth@163.com',
  feedbackWechat: 'YozerHealth',
  disclaimer: '仅供就诊参考，不作为诊断依据',
  variants: {
    release: {
      key: 'release',
      label: '正式版',
      file: 'YozerHealth-v1.0.0-release-arm64.apk',
      desc: '面向普通用户的对外发布版本，使用独立 release 签名。'
    },
    debug: {
      key: 'debug',
      label: '调试版',
      file: 'YozerHealth-v1.0.0-debug-arm64.apk',
      desc: '供开发调试使用，体积更大，包含调试信息，不建议日常安装。'
    }
  }
};

/** 首次运行生成随机管理员密码（不写入源码），并只打印一次 */
function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { salt: salt.toString('hex'), hash };
}

function loadAdmin({ quiet = false } = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ADMIN_FILE)) {
    // 云端 / 无人值守部署可通过环境变量指定初始密码（控制台日志通常不可见）；
    // 未指定时仍随机生成并只打印一次，保持原有行为。
    const envPw = process.env.ADMIN_PASSWORD;
    const initial = envPw || crypto.randomBytes(9).toString('base64url');
    const { salt, hash } = hashPassword(initial);
    fs.writeFileSync(
      ADMIN_FILE,
      JSON.stringify(
        { username: 'admin', salt, hash, createdAt: new Date().toISOString() },
        null,
        2
      ),
      'utf8'
    );
    if (!quiet) {
      if (envPw) {
        console.log('已通过 ADMIN_PASSWORD 环境变量设置管理员初始密码（账号 admin）。');
      } else {
        console.log('==================================================');
        console.log('  首次启动，已生成管理员初始凭据（仅显示这一次）');
        console.log('  账号：admin');
        console.log('  密码：' + initial);
        console.log('  请尽快执行：node server.js --set-password <新密码>');
        console.log('==================================================');
      }
    }
  }
  return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
}

function setPassword(password) {
  if (!password || password.length < 8) {
    throw new Error('密码至少 8 位');
  }
  const { salt, hash } = hashPassword(password);
  const prev = fs.existsSync(ADMIN_FILE)
    ? JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'))
    : { username: 'admin', createdAt: new Date().toISOString() };
  fs.writeFileSync(
    ADMIN_FILE,
    JSON.stringify(
      { ...prev, salt, hash, updatedAt: new Date().toISOString() },
      null,
      2
    ),
    'utf8'
  );
}

function verifyPassword(admin, password) {
  const { hash } = hashPassword(password, admin.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(admin.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  ROOT,
  PROJECT_ROOT,
  PORT,
  HOST,
  PUBLIC_DIR,
  DATA_DIR,
  APK_DIR,
  APK_SOURCE,
  ADMIN_FILE,
  EVENTS_FILE,
  DEMO_FILE,
  APP,
  loadAdmin,
  setPassword,
  verifyPassword
};
