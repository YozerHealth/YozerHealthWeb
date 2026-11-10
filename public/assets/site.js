/* 悦泽健康官网 —— 交互脚本（零依赖） */
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

  /* ---------- 匿名访客标识（仅用于 UV 去重，不含任何身份信息） ---------- */
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  let vid = localStorage.getItem('yh_vid');
  if (!vid) {
    vid = newId();
    localStorage.setItem('yh_vid', vid);
  }
  document.cookie = 'yh_vid=' + encodeURIComponent(vid) + '; path=/; max-age=31536000; SameSite=Lax';

  /* ---------- 访问埋点 ---------- */
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'visit',
      vid: vid,
      page: location.pathname,
      referrer: document.referrer || ''
    }),
    keepalive: true
  }).then(function (r) {
    if (!r.ok) console.warn('[悦泽健康] 访问统计写入云服务失败：HTTP ' + r.status);
  }).catch(function (e) {
    console.warn('[悦泽健康] 访问统计服务不可达：' + (e && e.message));
  });

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

  /* ---------- 从服务端读取真实版本与文件信息 ---------- */
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
  fetch('/api/meta').then(function (r) { return r.json(); }).then(function (d) {
    if (!d.ok) return;
    const app = d.app;
    const r = d.variants.release;
    const g = d.variants.debug;
    setText('heroSize', r.available ? YH.t('约 ') + (r.size / 1048576).toFixed(0) + ' MB' : '—');
    setText('dlVersion', 'V' + app.version);
    setText('dlCode', app.versionCode);
    ['R', 'D'].forEach(function (suffix) {
      const v = suffix === 'R' ? r : g;
      setText('dlFile' + suffix, v.file);
      setText('dlSize' + suffix, fmtSize(v.size));
      setText('dlTime' + suffix, fmtDate(v.updatedAt));
      setText('dlSha' + suffix, v.sha256 || YH.t('文件不可用'));
      if (!v.available) {
        const link = document.querySelector('a[href="/download/' + v.key + '"]');
        if (link) {
          link.style.pointerEvents = 'none';
          link.style.opacity = '.5';
          link.textContent = YH.t('安装包暂不可用');
        }
      }
    });
  }).catch(function () {
    setText('dlShaR', YH.t('无法读取'));
    setText('dlShaD', YH.t('无法读取'));
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
