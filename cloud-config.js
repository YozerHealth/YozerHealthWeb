'use strict';
/**
 * WorkBuddy 云服务 publicConfig。
 *
 * 本文件是 endpoint / oauthRelayBaseUrl / publishableKey 的**唯一来源**，
 * 内容直接来自 workbuddy_cloud_service 激活应用「悦泽健康官网」时返回的 publicConfig。
 * 这些是面向应用侧的公开值，可随前端代码一起发布；服务端不持有任何长期密钥，
 * 底层环境 ID 与 Provider 凭据由平台保管，不落在本仓库。
 *
 * 注意：endpoint 与应用的发布域名绑定。若将来更换 applicationId 重新创建应用，
 * 必须重新激活并把新的 publicConfig 同步到这里，否则服务端会连到旧环境。
 */
module.exports = {
  resourceId: 'wbcs_nNTtV4GYvsFhOCPDzGPoS0',
  endpoint: 'https://yozerhealth-site.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_p2MMsYiKPqm4VOGkrtM8dP_1zeQe0QoHiWuQY3tgq5S9PqXJ4V9IoDT'
};
