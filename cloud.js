'use strict';
/**
 * 云服务客户端单例。
 * 全站（服务端 + 各模块）只初始化一次，Database / Auth / Storage / LLM 共用该实例。
 * 三个必填值全部取自 cloud-config.js（即 publicConfig），不在业务代码里另写端点。
 */

/**
 * Web Storage 垫片（必须在 require SDK 之前注入）。
 *
 * Node 22+ 提供 globalThis.localStorage，但只有在传入 --localstorage-file 时
 * 才真正可用且持久化；否则访问即打印 ExperimentalWarning（且不持久化）。
 * 云 SDK 启动时会探测 globalThis.localStorage 并自带 try/catch 降级到内存存储，
 * 所以功能不受影响，但会在日志留下噪音，在 Vercel 等 Serverless 环境尤其明显。
 *
 * 这里在加载 SDK 前用等价的内存 Storage 提前占位：
 *   - 消除上述 ExperimentalWarning；
 *   - 保证 SDK 在只读 / Serverless 文件系统上拿到可用的存储（会话令牌等）。
 * 该函数只服务端子运行，不影响浏览器端（浏览器本就有原生 localStorage）。
 */
(function ensureWebStorage() {
  function memoryStorage() {
    const map = new Map();
    return {
      get length() { return map.size; },
      key: (i) => Array.from(map.keys())[i] ?? null,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(String(k), String(v)); },
      removeItem: (k) => { map.delete(k); },
      clear: () => map.clear()
    };
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      Object.defineProperty(globalThis, name, {
        value: memoryStorage(),
        configurable: true,
        enumerable: false,
        writable: true
      });
    } catch {
      // 极少数 Node 版本把该全局定义为不可重定义：放弃覆盖，SDK 仍会自带降级，
      // 仅保留一条无害的 ExperimentalWarning，不影响功能。
    }
  }
})();

const { createWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk');
const publicConfig = require('./cloud-config');

const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey
});

module.exports = { cloud, publicConfig };
