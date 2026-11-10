'use strict';
/**
 * 应用元信息（单一来源）。
 * 本地 server.js 与 Vercel 的 api/ 函数都从这里读取，避免双份定义漂移。
 * 全部取自 V1.0.0 真实构建产物；字段与 publicMeta() 中 app 字段保持一致。
 */
module.exports = {
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
