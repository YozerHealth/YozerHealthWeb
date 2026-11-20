/* 悦泽健康官网 —— 交互脚本（零依赖 · 纯静态，不含任何后端请求） */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;

  /* ---------- 深浅主题 ---------- */
  const savedTheme = localStorage.getItem('yh_theme');
  if (savedTheme) root.dataset.theme = savedTheme;
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) root.dataset.theme = 'dark';
  const toggle = $('#themeToggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      localStorage.setItem('yh_theme', next);
    });
  }

  /* ---------- 静态应用元信息 ----------
   * 来源：V1.0.0 真实构建产物 + 安装包文件的实际 SHA-256 / 大小 / 时间。
   * 原 /api/meta 接口已随纯静态化移除，此处固化为常量，页面不再发起任何网络请求。
   * 后续更新 APK 时，只需同步修改本常量与下载直链即可。 */
  const META = {
    app: { version: '1.0.0', versionCode: 23 },
    variants: {
      release: {
        key: 'release',
        file: 'YozerHealth-v1.0.0-release-arm64.apk',
        size: 26402629,
        updatedAt: '2026-11-09T18:39:54.000Z',
        sha256: 'A62C8464D85BCBEAFAEC30B0E4096A4893645818DDE3CEA14A2969E8F6D78725',
        available: true
      },
      debug: {
        key: 'debug',
        file: 'YozerHealth-v1.0.0-debug-arm64.apk',
        size: 33817104,
        updatedAt: '2026-11-09T18:39:54.000Z',
        sha256: 'AA4B48C933F3B2CBFAFD6B125547FC9AF77FCA095873B898F9E98B34574755CA',
        available: true
      }
    }
  };

  /* ---------- 轻量提示 ---------- */
  function toast(msg) {
    let el = document.getElementById('yhToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'yhToast';
      el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(12px);' +
        'background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:10px;font-size:13px;' +
        'z-index:99;opacity:0;transition:.25s;pointer-events:none;box-shadow:var(--shadow)';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(function () {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(12px)';
    }, 1900);
  }

  /* ---------- 复制校验值 ---------- */
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const target = document.getElementById(btn.dataset.copy);
      const text = target ? target.textContent.trim() : '';
      if (!text || text.indexOf(YH.t('读取中')) >= 0) return;
      const fallback = function () {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); toast(YH.t('SHA-256 已复制')); } catch (e) { toast(YH.t('复制失败，请手动选择')); }
        document.body.removeChild(ta);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(YH.t('SHA-256 已复制')); }).catch(fallback);
      } else fallback();
    });
  });

  /* ---------- 下载按钮反馈 ---------- */
  document.querySelectorAll('[data-dl]').forEach(function (a) {
    a.addEventListener('click', function () {
      const original = a.innerHTML;
      a.style.opacity = '.72';
      a.style.pointerEvents = 'none';
      setTimeout(function () {
        a.style.opacity = '';
        a.style.pointerEvents = '';
        a.innerHTML = original;
      }, 2500);
    });
  });

  /* ---------- 用静态数据填充版本与文件信息（无网络请求） ---------- */
  function fmtSize(n) {
    if (!n) return '—';
    return (n / 1048576).toFixed(1) + ' MB (' + n.toLocaleString(YH.isEn() ? 'en-US' : 'zh-CN') + YH.t(' 字节)');
  }
  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return '—';
    return d.toLocaleString(YH.isEn() ? 'en-US' : 'zh-CN', { hour12: false });
  }
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  const app = META.app;
  const r = META.variants.release;
  const g = META.variants.debug;
  setText('heroSize', r.available ? YH.t('约 ') + (r.size / 1048576).toFixed(0) + ' MB' : '—');
  setText('dlVersion', 'V' + app.version);
  setText('dlCode', app.versionCode);
  ['R', 'D'].forEach(function (suffix) {
    const v = suffix === 'R' ? r : g;
    setText('dlFile' + suffix, v.file);
    setText('dlSize' + suffix, fmtSize(v.size));
    setText('dlTime' + suffix, fmtDate(v.updatedAt));
    setText('dlSha' + suffix, v.sha256 || YH.t('文件不可用'));
  });

  /* ---------- 滚动揭示 ---------- */
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }
})();
