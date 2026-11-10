/* 悦泽健康官网 / 后台 —— 轻量国际化运行时（零依赖）
 * 字典由 tools/gen_i18n.py 生成，位于同目录 i18n-dict.js。
 * 语言优先级：用户手动选择(localStorage) > 浏览器语言 > 中文。
 * 策略与 App 端 L10n 一致：按中文原文查表，查不到原样返回，绝不猜测或填充。
 */
(function (global) {
  'use strict';
  var DICT = (typeof global.YH_DICT === 'object' && global.YH_DICT) || {};
  var KEY = 'yh_lang';
  var ATTRS = ['placeholder', 'title', 'alt', 'aria-label', 'content', 'value'];
  var CJK = /[\u4e00-\u9fff]/;
  var PH = /\{\d+\}/;

  var textOrigins = new WeakMap();
  var attrOrigins = new WeakMap();
  var listeners = [];
  var templates = null;
  var normDict = null;

  function normalize(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  function buildNormDict() {
    if (normDict) return normDict;
    normDict = {};
    Object.keys(DICT).forEach(function (zh) {
      var k = normalize(zh);
      if (k && !(k in normDict)) normDict[k] = DICT[zh];
    });
    return normDict;
  }

  function detect() {
    var saved = null;
    try { saved = global.localStorage && global.localStorage.getItem(KEY); } catch (e) { /* 隐私模式 */ }
    if (saved === 'en' || saved === 'zh') return saved;
    // 首次访问可用 ?lang=en / ?lang=zh 指定（便于分享与验收），之后以用户选择为准
    try {
      var q = global.location && new URLSearchParams(global.location.search).get('lang');
      if (q === 'en' || q === 'zh') return q;
    } catch (e) { /* 旧浏览器 */ }
    var langs = global.navigator
      ? (global.navigator.languages && global.navigator.languages.length
          ? global.navigator.languages : [global.navigator.language || ''])
      : [];
    for (var i = 0; i < langs.length; i++) {
      if (/^en\b/i.test(String(langs[i] || ''))) return 'en';
    }
    return 'zh';
  }

  var lang = detect();

  function isEn() { return lang === 'en'; }
  function getLang() { return lang; }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function buildTemplates() {
    if (templates) return templates;
    templates = [];
    Object.keys(DICT).forEach(function (zh) {
      if (!PH.test(zh)) return;
      var parts = zh.split(/\{\d+\}/);
      var pattern = '^' + parts.map(function (p, i) {
        return (i ? '(.*?)' : '') + escapeRe(p);
      }).join('') + '$';
      var en = DICT[zh];
      try {
        templates.push({
          re: new RegExp(pattern),
          en: en,
          spec: zh.replace(/\{\d+\}/g, '').length
        });
      } catch (e) { /* 忽略异常模板 */ }
    });
    templates.sort(function (a, b) {
      return b.spec - a.spec || b.en.length - a.en.length;
    });
    return templates;
  }

  /** 翻译中文原文；可选参数用于显式模板：YH.t('共 {0} 条', n) */
  function t(zh) {
    if (!isEn() || zh === null || zh === undefined) return zh;
    var s = String(zh);
    var args = Array.prototype.slice.call(arguments, 1);
    var hit = DICT[s];
    if (hit === undefined) hit = DICT[s.trim()];
    if (hit !== undefined) {
      var out = hit;
      if (args.length) {
        for (var i = 0; i < args.length; i++) {
          out = out.split('{' + i + '}').join(String(args[i]));
        }
      }
      return out;
    }
    // HTML 源码里的换行 / 缩进字典抽取时已归一化，这里做同样的归一化后再查一次
    var normHit = buildNormDict()[normalize(s)];
    if (normHit !== undefined) return normHit;
    var list = buildTemplates();
    for (var j = 0; j < list.length; j++) {
      var m = list[j].re.exec(s);
      if (!m) continue;
      var text = list[j].en;
      for (var k = 1; k < m.length; k++) {
        text = text.split('{' + (k - 1) + '}').join(m[k]);
      }
      if (!PH.test(text)) return text;
    }
    return s;
  }

  function apply(root) {
    var scope = root || global.document;
    if (!scope || !global.document) return;
    var walker = global.document.createTreeWalker(scope, global.NodeFilter.SHOW_TEXT, null, false);
    var nodes = [], node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function (n) {
      var parent = n.parentNode;
      if (!parent) return;
      var tag = String(parent.nodeName || '').toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'textarea') return;
      // 语言切换按钮的文字由 updateSwitchLabels 独占管理，避免被 DOM 自动翻译来回覆盖
      if (parent.hasAttribute && parent.hasAttribute('data-yh-lang-toggle')) return;
      var orig = textOrigins.get(n);
      if (orig === undefined) {
        orig = n.nodeValue;
        textOrigins.set(n, orig);
      }
      if (!CJK.test(orig)) return;
      n.nodeValue = isEn() ? t(orig) : orig;
    });

    if (!scope.querySelectorAll) return;
    var selector = ATTRS.map(function (a) { return '[' + a + ']'; }).join(',');
    var els = scope.querySelectorAll(selector);
    Array.prototype.forEach.call(els, function (el) {
      var saved = attrOrigins.get(el);
      if (!saved) { saved = {}; attrOrigins.set(el, saved); }
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        if (!(a in saved)) saved[a] = el.getAttribute(a);
        var orig = saved[a];
        if (!orig || !CJK.test(orig)) return;
        el.setAttribute(a, isEn() ? t(orig) : orig);
      });
    });
  }

  function updateSwitchLabels() {
    if (!global.document) return;
    var btns = global.document.querySelectorAll('[data-yh-lang-toggle]');
    Array.prototype.forEach.call(btns, function (b) {
      b.textContent = isEn() ? '中文' : 'EN';
      b.setAttribute('aria-label', isEn() ? 'Switch to Chinese' : 'Switch to English');
      b.setAttribute('title', isEn() ? 'Switch to Chinese' : 'Switch to English');
    });
  }

  function setLang(next) {
    lang = (next === 'en') ? 'en' : 'zh';
    try { global.localStorage && global.localStorage.setItem(KEY, lang); } catch (e) { /* 隐私模式 */ }
    if (global.document && global.document.documentElement) {
      global.document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
    }
    apply(global.document);
    updateSwitchLabels();
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) { /* 单个回调失败不影响其余 */ } });
    try {
      global.document && global.document.dispatchEvent(new CustomEvent('yh:langchange', { detail: { lang: lang } }));
    } catch (e) { /* 旧浏览器 */ }
  }

  function toggle() { setLang(isEn() ? 'zh' : 'en'); }
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  function init() {
    if (!global.document) return;
    if (global.document.documentElement) {
      global.document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
    }
    apply(global.document);
    updateSwitchLabels();
    var binds = global.document.querySelectorAll('[data-yh-lang-toggle]');
    Array.prototype.forEach.call(binds, function (b) {
      b.addEventListener('click', toggle);
    });
    // 动态渲染（图表、表格）产生的新节点自动跟随当前语言
    if (global.MutationObserver) {
      var queued = false;
      var obs = new global.MutationObserver(function () {
        if (queued) return;
        queued = true;
        setTimeout(function () { queued = false; apply(global.document); }, 0);
      });
      obs.observe(global.document.documentElement, { childList: true, subtree: true, characterData: false });
    }
  }

  var api = {
    t: t, apply: apply, lang: getLang, isEn: isEn,
    setLang: setLang, toggle: toggle, onChange: onChange,
    dictSize: Object.keys(DICT).length
  };
  global.YH = api;

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
