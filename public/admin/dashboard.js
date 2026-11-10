/* 悦泽健康管理看板 —— 数据加载与原生 SVG 图表渲染（零依赖） */
(function () {
  'use strict';
  const $ = (s) => document.getElementById(s);
  const root = document.documentElement;

  const state = { days: 30, demo: false, data: null };
  const COLORS = ['#0f766e', '#0284c7', '#d97706', '#7c3aed', '#db2777', '#64748b', '#0891b2'];

  /* ---------------- 通用工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  const num = (n) => Number(n || 0).toLocaleString(YH.isEn() ? 'en-US' : 'zh-CN');
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function fmtTime(ts) {
    return new Date(ts).toLocaleString(YH.isEn() ? 'en-US' : 'zh-CN', { hour12: false });
  }
  function emptyBox(title, sub, action) {
    return '<div class="empty"><span class="e-ico">▤</span><b>' + esc(title) + '</b>' +
      '<small>' + esc(sub) + '</small>' + (action || '') + '</div>';
  }

  /* ---------------- 主题 ---------------- */
  const saved = localStorage.getItem('yh_theme');
  if (saved) root.dataset.theme = saved;
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) root.dataset.theme = 'dark';
  $('themeBtn').addEventListener('click', function () {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('yh_theme', next);
    if (state.data) renderCharts(state.data); // 重新绘制以适配新主题的 CSS 变量
  });

  /* ---------------- 数据加载 ---------------- */
  function load() {
    $('noteText').textContent = YH.t('正在读取统计数据…');
    fetch('/api/admin/stats?days=' + state.days + '&demo=' + (state.demo ? 1 : 0), { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) { location.replace('/admin/login.html'); return null; }
        return r.json();
      })
      .then(function (d) {
        if (!d) return;
        if (!d.ok) {
          $('noteText').textContent = d.error || YH.t('读取失败，请确认服务已启动后点击「刷新统计」。');
          return;
        }
        state.data = d;
        render(d);
      })
      .catch(function () { $('noteText').textContent = YH.t('读取失败，请确认服务已启动后点击「刷新统计」。'); });
  }

  /* ---------------- 渲染入口 ---------------- */
  function render(d) {
    const isDemo = d.source === 'demo';
    $('srcPill').textContent = isDemo ? YH.t('演示数据') : YH.t('真实数据');
    $('srcPill').className = 'src-pill' + (isDemo ? ' demo' : '');
    $('srcTag').textContent = isDemo ? YH.t('演示数据') : YH.t('真实数据');
    $('srcTag').className = 'tag' + (isDemo ? ' demo' : '');
    const cloudTag = d.storage === 'cloud-database'
      ? (YH.isEn() ? ' · Cloud database' : ' · 云数据库')
      : '';
    $('noteText').textContent = YH.t(d.note) + YH.t('；统计口径见页面底部说明。') + cloudTag;
    $('noteStamp').textContent = YH.t('生成于 ') + fmtTime(new Date(d.generatedAt).getTime()) +
      YH.t(' · 区间 ') + d.range.from.slice(0, 10) + YH.t(' 至 ') + d.range.to.slice(0, 10) +
      YH.t(' · 事件库共 ') + num(d.totalEvents) + YH.t(' 条');
    $('demoBanner').classList.toggle('show', isDemo);
    $('demoBtn').textContent = isDemo ? YH.t('返回真实数据') : YH.t('载入演示数据');
    $('demoBtn').classList.toggle('on', isDemo);
    $('trendHint').textContent = YH.t('按日聚合 · 最近 ') + d.range.days + YH.t(' 天 · 服务器本地时区');

    const k = d.kpi;
    $('kpiPv').textContent = num(k.pv);
    $('kpiUv').textContent = num(k.uv);
    $('kpiDl').textContent = num(k.downloads);
    $('kpiToday').textContent = num(k.downloadsToday) + ' / ' + num(k.visitsToday);
    $('convSub').textContent = YH.t('下载转化率 ') + k.conversion + '%';

    setDelta('pvDelta', k.pvDelta);
    setDelta('dlDelta', k.downloadDelta);

    const empty = k.pv === 0 && k.downloads === 0;
    $('globalEmpty').classList.toggle('show', empty);

    renderCharts(d);
    renderTable(d.recent);
  }

  function setDelta(id, v) {
    const el = $(id);
    if (v === null || v === undefined) {
      el.textContent = '—';
      el.className = 'k-delta';
      return;
    }
    el.textContent = (v > 0 ? '+' : '') + v + '%';
    el.className = 'k-delta ' + (v >= 0 ? 'up' : 'down');
  }

  /* ---------------- 折线图：访问 / 下载趋势 ---------------- */
  function lineChart(trend) {
    const W = 980, H = 290, L = 52, R = 18, T = 18, B = 38;
    const n = trend.length;
    const values = trend.reduce((a, x) => a.concat([x.visits, x.downloads]), []);
    const max = Math.max(1, ...values);
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const step = Math.max(1, Math.ceil(max / 5 / mag) * mag);
    const nice = step * 5;
    const iw = W - L - R, ih = H - T - B;
    const x = (i) => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = (v) => T + ih - (v / nice) * ih;

    let g = '';
    for (let i = 0; i <= 5; i++) {
      const yy = T + ih - (i * ih) / 5;
      g += '<line x1="' + L + '" y1="' + yy + '" x2="' + (W - R) + '" y2="' + yy +
        '" style="stroke:var(--chart-grid)" stroke-width="1"/>';
      g += '<text x="' + (L - 10) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" style="fill:var(--ink3)">' + (i * step) + '</text>';
    }
    const labelStep = Math.max(1, Math.ceil(n / 9));
    let xl = '';
    for (let i = 0; i < n; i += labelStep) {
      xl += '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10.5" style="fill:var(--ink3)">' + esc(trend[i].label) + '</text>';
    }

    const pts = (key) => trend.map((t, i) => x(i).toFixed(1) + ',' + y(t[key]).toFixed(1)).join(' ');
    let dots = '';
    for (let i = 0; i < n; i++) {
      const t = trend[i];
      const cx = x(i).toFixed(1);
      dots += '<circle cx="' + cx + '" cy="' + y(t.visits).toFixed(1) + '" r="3" style="fill:var(--primary)">' +
        '<title>' + esc(t.date) + YH.t('　访问 ') + t.visits + YH.t('　下载 ') + t.downloads + '</title></circle>';
      dots += '<circle cx="' + cx + '" cy="' + y(t.downloads).toFixed(1) + '" r="3" style="fill:var(--amber)">' +
        '<title>' + esc(t.date) + YH.t('　访问 ') + t.visits + YH.t('　下载 ') + t.downloads + '</title></circle>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + YH.t('访问与下载趋势折线图') + '">' +
      '<defs><linearGradient id="pvArea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#0f766e" stop-opacity=".22"/><stop offset="1" stop-color="#0f766e" stop-opacity="0"/>' +
      '</linearGradient></defs>' + g + xl +
      '<polygon points="' + x(0).toFixed(1) + ',' + (T + ih) + ' ' + pts('visits') + ' ' + x(n - 1).toFixed(1) + ',' + (T + ih) + '" fill="url(#pvArea)"/>' +
      '<polyline points="' + pts('visits') + '" fill="none" style="stroke:var(--primary)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<polyline points="' + pts('downloads') + '" fill="none" style="stroke:var(--amber)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + '</svg>';
  }

  /* ---------------- 环形图 ---------------- */
  function donut(items, label) {
    const total = items.reduce((a, b) => a + b.value, 0);
    if (!total) return emptyBox(YH.t('暂无 {0} 数据', label), YH.t('当前时间范围内没有可统计的事件。'));
    const cx = 118, cy = 112, r = 68, sw = 26;
    const C = 2 * Math.PI * r;
    let acc = 0;
    let arcs = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" style="stroke:var(--chart-grid)" stroke-width="' + sw + '"/>';
    items.slice(0, 7).forEach(function (it, i) {
      const frac = it.value / total;
      arcs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + COLORS[i % COLORS.length] +
        '" stroke-width="' + sw + '" stroke-dasharray="' + (frac * C).toFixed(2) + ' ' + C.toFixed(2) +
        '" stroke-dashoffset="' + (-acc * C).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')">' +
        '<title>' + esc(YH.t(it.name)) + '：' + it.value + '（' + (frac * 100).toFixed(1) + '%）</title></circle>';
      acc += frac;
    });
    let legend = '';
    items.slice(0, 7).forEach(function (it, i) {
      const yy = 42 + i * 26;
      legend += '<rect x="248" y="' + (yy - 9) + '" width="11" height="11" rx="3" fill="' + COLORS[i % COLORS.length] + '"/>' +
        '<text x="268" y="' + yy + '" font-size="12" style="fill:var(--ink)">' + esc(YH.t(it.name)) + '</text>' +
        '<text x="452" y="' + yy + '" text-anchor="end" font-size="12" font-weight="700" style="fill:var(--ink2)">' +
        num(it.value) + ' · ' + (it.value / total * 100).toFixed(1) + '%</text>';
    });
    return '<svg viewBox="0 0 468 224" role="img" aria-label="' + esc(label) + ' ' + YH.t('环形图') + '">' + arcs +
      '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-size="26" font-weight="800" style="fill:var(--ink)">' + num(total) + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 20) + '" text-anchor="middle" font-size="11" style="fill:var(--ink3)">' + esc(label) + ' ' + YH.t('合计') + '</text>' +
      legend + '</svg>';
  }

  /* ---------------- 横向条形图 ---------------- */
  function hbar(items, label) {
    if (!items || !items.length) return emptyBox(YH.t('暂无 {0} 数据', label), YH.t('当前时间范围内没有可统计的事件。'));
    const top = items.slice(0, 8);
    const max = Math.max(1, ...top.map((x) => x.value));
    const rowH = 30, H = top.length * rowH + 20, W = 468;
    let out = '';
    top.forEach(function (it, i) {
      const y = 18 + i * rowH;
      const w = Math.max(2, (it.value / max) * 232);
      out += '<text x="8" y="' + (y + 13) + '" font-size="12" style="fill:var(--ink)">' + esc(YH.t(it.name)) + '</text>';
      out += '<rect x="128" y="' + (y + 3) + '" width="232" height="14" rx="7" style="fill:var(--chart-grid)"/>';
      out += '<rect x="128" y="' + (y + 3) + '" width="' + w.toFixed(1) + '" height="14" rx="7" fill="' + COLORS[i % COLORS.length] + '">' +
        '<title>' + esc(YH.t(it.name)) + ' · ' + it.value + '</title></rect>';
      out += '<text x="452" y="' + (y + 14) + '" text-anchor="end" font-size="11.5" font-weight="700" style="fill:var(--ink2)">' + num(it.value) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + ' ' + YH.t('条形图') + '">' + out + '</svg>';
  }

  /* ---------------- 24 小时柱状图 ---------------- */
  function hoursBar(hours) {
    const total = hours.reduce((a, b) => a + b, 0);
    if (!total) return emptyBox(YH.t('暂无时段数据'), YH.t('当前时间范围内没有访问记录。'));
    const W = 680, H = 226, L = 34, R = 12, T = 14, B = 32;
    const max = Math.max(1, ...hours);
    const iw = W - L - R, ih = H - T - B;
    const bw = iw / 24 * 0.66;
    let out = '';
    for (let i = 0; i <= 4; i++) {
      const yy = T + ih - (i * ih) / 4;
      out += '<line x1="' + L + '" y1="' + yy + '" x2="' + (W - R) + '" y2="' + yy + '" style="stroke:var(--chart-grid)" stroke-width="1"/>';
      out += '<text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" style="fill:var(--ink3)">' + Math.round(max * i / 4) + '</text>';
    }
    for (let h = 0; h < 24; h++) {
      const bh = (hours[h] / max) * ih;
      const bx = L + (h * iw) / 24 + (iw / 24 - bw) / 2;
      out += '<rect x="' + bx.toFixed(1) + '" y="' + (T + ih - bh).toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.max(1, bh).toFixed(1) + '" rx="3" fill="#0f766e" fill-opacity=".82">' +
        '<title>' + h + ':00–' + h + YH.t(':59　访问 ') + hours[h] + '</title></rect>';
      if (h % 3 === 0) out += '<text x="' + (bx + bw / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" style="fill:var(--ink3)">' + h + '</text>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + YH.t('访问时段分布柱状图') + '">' + out + '</svg>';
  }

  /* ---------------- 图表总渲染 ---------------- */
  function renderCharts(d) {
    $('trendChart').innerHTML = lineChart(d.trend);
    $('deviceChart').innerHTML = d.devices.length ? donut(d.devices, YH.t('访问')) : emptyBox(YH.t('暂无设备分布数据'), YH.t('当前时间范围内没有访问记录。'));
    $('variantChart').innerHTML = d.variants.length ? donut(d.variants.map(function (v) {
      return { name: v.name === 'release' ? YH.t('正式版') : (v.name === 'debug' ? YH.t('调试版') : v.name), value: v.value };
    }), YH.t('下载')) : emptyBox(YH.t('暂无下载记录'), YH.t('当前时间范围内没有 APK 下载事件。'));
    $('browserChart').innerHTML = hbar(d.browsers, YH.t('浏览器'));
    $('hoursChart').innerHTML = hoursBar(d.hours);
    if (d.geoAvailable) {
      $('regionChart').innerHTML = hbar(d.regions, YH.t('地域'));
      $('regionHint').textContent = d.source === 'demo' ? YH.t('演示地域数据（示例）') : YH.t('数据来源：IP 归属库');
    } else {
      $('regionChart').innerHTML = emptyBox(
        YH.t('地域数据未接入'),
        YH.t(d.geoNote || YH.t('未接入 IP 归属库，真实数据不提供地域推断；此处不做估算填充。')),
        ''
      );
      $('regionHint').textContent = YH.t('数据来源：IP 归属库（未接入，字段留空）');
    }
  }

  /* ---------------- 明细表 ---------------- */
  function renderTable(rows) {
    const body = $('tableBody');
    const empty = $('tableEmpty');
    if (!rows || !rows.length) {
      body.innerHTML = '';
      empty.style.display = 'grid';
      $('tableHint').textContent = YH.t('最多显示 120 条 · IP 已脱敏');
      return;
    }
    empty.style.display = 'none';
    $('tableHint').textContent = YH.t('显示最近 ') + rows.length + YH.t(' 条 · IP 已脱敏');
    body.innerHTML = rows.map(function (r) {
      const isDl = r.type === 'download';
      const variant = r.variant === 'release' ? YH.t('正式版') : (r.variant === 'debug' ? YH.t('调试版') : '—');
      return '<tr>' +
        '<td>' + esc(fmtTime(r.ts)) + '</td>' +
        '<td><span class="badge ' + (isDl ? 'download' : 'visit') + '">' + (isDl ? YH.t('下载') : YH.t('访问')) + '</span></td>' +
        '<td>' + esc(variant) + '</td>' +
        '<td>' + esc(YH.t(r.device)) + '</td>' +
        '<td>' + esc(YH.t(r.os)) + '</td>' +
        '<td>' + esc(YH.t(r.browser)) + '</td>' +
        '<td class="mono">' + esc(r.ip) + '</td>' +
        '<td>' + esc(r.page || '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---------------- 控件 ---------------- */
  $('daysSel').addEventListener('change', function () {
    state.days = Number(this.value);
    load();
  });

  $('demoBtn').addEventListener('click', toggleDemo);
  $('loadDemoBtn').addEventListener('click', function () { if (!state.demo) toggleDemo(); });
  $('demoClearBtn').addEventListener('click', function () { if (state.demo) toggleDemo(); });
  $('refreshBtn').addEventListener('click', load);

  function toggleDemo() {
    const action = state.demo ? 'clear' : 'load';
    fetch('/api/admin/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { toast(d.error || YH.t('操作失败')); return; }
      state.demo = action === 'load';
      toast(action === 'load' ? YH.t('已载入演示数据（不影响真实统计）') : YH.t('已清除演示数据'));
      load();
    }).catch(function () { toast(YH.t('无法连接服务器')); });
  }

  $('exportBtn').addEventListener('click', function () {
    location.href = '/api/admin/export.csv?days=' + state.days + '&demo=' + (state.demo ? 1 : 0) + '&lang=' + (YH.isEn() ? 'en' : 'zh');
    toast(YH.t('正在导出 CSV'));
  });

  $('logoutBtn').addEventListener('click', function () {
    fetch('/api/admin/logout', { method: 'POST' }).then(function () {
      location.replace('/admin/login.html');
    }).catch(function () { location.replace('/admin/login.html'); });
  });

  // 未登录直接跳回登录页（服务端也会拦截 dashboard.html）
  fetch('/api/admin/session').then(function (r) { return r.json(); }).then(function (d) {
    if (!d.authenticated) location.replace('/admin/login.html');
    else load();
  }).catch(function () { $('noteText').textContent = YH.t('无法连接服务器'); });
})();
