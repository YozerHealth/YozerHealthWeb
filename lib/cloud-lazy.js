'use strict';
/**
 * 云服务适配层懒加载。
 *
 * Vercel 能否成功 `npm install` 并连通 @tencent-ai/workbuddy-cloud-sdk 不可控：
 *   - 若 SDK 已安装且连通 → 返回 cloud-store 实例，统计/下载事件写入云数据库；
 *   - 若 SDK 未安装（install 失败）或连通失败 → 返回 null，调用方降级处理，
 *     绝不因此阻塞页面与 APK 下载。
 *
 * 使用 undefined 作为“尚未探测”哨兵，探测一次后缓存结果（热实例内有效）。
 */
let store = undefined;

function getCloud() {
  if (store !== undefined) return store;
  try {
    store = require('../cloud-store');
  } catch (e) {
    store = null;
  }
  return store;
}

module.exports = getCloud;
