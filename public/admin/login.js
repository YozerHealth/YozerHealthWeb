/* 管理后台登录页脚本 */
(function () {
  'use strict';
  const root = document.documentElement;
  const saved = localStorage.getItem('yh_theme');
  if (saved) root.dataset.theme = saved;
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) root.dataset.theme = 'dark';

  const form = document.getElementById('loginForm');
  const user = document.getElementById('username');
  const pass = document.getElementById('password');
  const err = document.getElementById('err');
  const btn = document.getElementById('submitBtn');
  const eye = document.getElementById('eyeBtn');

  // 已登录则直接进入看板
  fetch('/api/admin/session').then(function (r) { return r.json(); }).then(function (d) {
    if (d.authenticated) location.replace('/admin/dashboard.html');
  }).catch(function () {});

  eye.addEventListener('click', function () {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.textContent = show ? YH.t('隐藏') : YH.t('显示');
  });

  function showError(msg) {
    err.textContent = msg;
    err.classList.add('show');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.classList.remove('show');
    btn.disabled = true;
    btn.textContent = YH.t('正在登录…');
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.value.trim(), password: pass.value })
    }).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, data: d }; });
    }).then(function (res) {
      if (res.status === 200 && res.data.ok) {
        location.replace('/admin/dashboard.html');
        return;
      }
      showError(YH.t(res.data.error || YH.t('登录失败，请重试')));
      pass.value = '';
      pass.focus();
      btn.disabled = false;
      btn.textContent = YH.t('登录管理后台');
    }).catch(function () {
      showError(YH.t('无法连接服务器，请确认服务已启动'));
      btn.disabled = false;
      btn.textContent = YH.t('登录管理后台');
    });
  });
})();
