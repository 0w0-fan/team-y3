/* ==========================================================================
 * screen.js  ——  可视化大屏逻辑（可交互版）
 *
 *   1. 调 SpringBoot 的 /api/time/* 接口（失败则回退到本地快照，方便离线演示）
 *   2. 用标准 ECharts option 描述 4 张图（联网用 ECharts，断网用 echarts-lite）
 *   3. 交互全部做在 DOM + 数据层，不依赖某个引擎的私有事件，两种引擎行为一致：
 *        · 年代双滑块  → 裁剪 era5 / year / decade 三个聚合序列，KPI 与结论同步重算
 *        · 回放按钮    → 自动推进右边界，演示“响度战争”的时间演化
 *        · 口径切换    → 等权 / 歌单加权（playlist_cnt）中位数切换
 *        · 曲风筛选    → 过滤散点图，同步更新皮尔逊相关与象限统计
 *        · 面板放大    → 单图全屏，方便答辩讲解
 * ========================================================================== */
(function () {
  'use strict';

  var API = {
    overview: '/api/time/overview',
    duration: '/api/time/duration-evolution',
    loudness: '/api/time/loudness-war',
    bpm: '/api/time/bpm-distribution',
    scatter: '/api/time/popularity-scatter',
    matrix: '/api/time/genre-decade'
  };
  var SNAPSHOT = 'data/dashboard.json';
  var QUALITY = 'data/quality.json';

  var PALETTE = ['#4d8dff', '#38e1ff', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#60a5fa', '#f97316'];
  var AXIS_COLOR = '#7d92b3';
  var GRID_LINE = 'rgba(86,124,178,0.16)';

  /* 起点取 1955：最早一个五年分组是 1955-1959（3 首），
     只有从这里开始，“全区间”的曲目合计才等于真实的 28,351 首 */
  var YEAR_MIN = 1955, YEAR_MAX = 2020, YEAR_STEP = 5;

  /* 全局交互状态 */
  var STATE = {
    from: YEAR_MIN,
    to: YEAR_MAX,
    weighted: false,      // false=等权中位数，true=歌单加权中位数
    genre: '',            // 散点图曲风筛选，''=全部
    colorBy: 'pop',       // 散点着色：pop | genre
    playing: false,
    maxChart: null
  };

  var charts = {};
  var RAW = null;          // 接口/快照原始数据
  var GENRE_COLOR = {};    // 曲风 → 颜色
  var playTimer = null;

  /* ------------------------------------------------------------ 小工具 */
  function $(id) { return document.getElementById(id); }

  function fmt(n, digits) {
    if (n === null || n === undefined || isNaN(n)) { return '—'; }
    return Number(n).toLocaleString('zh-CN', {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0
    });
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function lerpColor(c1, c2, t) {
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    var r = Math.round((((a >> 16) & 255) * (1 - t)) + (((b >> 16) & 255) * t));
    var g = Math.round((((a >> 8) & 255) * (1 - t)) + (((b >> 8) & 255) * t));
    var bl = Math.round(((a & 255) * (1 - t)) + ((b & 255) * t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function popColor(p) {
    var stops = [[0, '#2b4a72'], [30, '#3d7dd6'], [55, '#38e1ff'], [78, '#7ce7c3'], [92, '#fbbf24'], [100, '#fb7185']];
    for (var i = 1; i < stops.length; i++) {
      if (p <= stops[i][0]) {
        var t = (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return lerpColor(stops[i - 1][1], stops[i][1], clamp(t, 0, 1));
      }
    }
    return stops[stops.length - 1][1];
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ------------------------------------------------------------ 数据加载 */
  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) { throw new Error(url + ' ' + r.status); }
      return r.json();
    });
  }

  function unwrap(res) {
    if (!res || res.code !== 200) { throw new Error((res && (res.msg || res.message)) || 'bad response'); }
    return res.data;
  }

  function loadAll() {
    var tasks = {
      overview: getJSON(API.overview).then(unwrap),
      duration: getJSON(API.duration).then(unwrap),
      loudness: getJSON(API.loudness).then(unwrap),
      bpm: getJSON(API.bpm).then(unwrap),
      scatter: getJSON(API.scatter).then(unwrap),
      /* 核心矩阵是新增接口：旧版后端没有它时不能让整页崩掉。
         这里单独吞掉异常，渲染层再决定是降级估算还是提示重启后端 */
      matrix: getJSON(API.matrix).then(unwrap).catch(function () { return null; })
    };
    var keys = Object.keys(tasks);
    return Promise.all(keys.map(function (k) { return tasks[k]; }))
      .then(function (list) {
        var out = {};
        keys.forEach(function (k, i) { out[k] = list[i]; });
        out.__source = 'api';
        return out;
      })
      .catch(function (err) {
        console.warn('[dashboard] 接口不可用，切换到本地快照：', err.message);
        return getJSON(SNAPSHOT).then(function (snap) {
          snap.__source = 'snapshot';
          return snap;
        });
      });
  }

  function setStatus(ok, text) {
    var el = $('apiStatus');
    el.className = 'status ' + (ok ? 'ok' : 'warn');
    $('apiStatusText').textContent = text;
  }

  /* ============================================================ 区间裁剪
   * 三个聚合序列的时间键各不相同：
   *   duration → era5 形如 "1965-1969"（取前 4 位当年份）
   *   loudness → year 整数
   *   bpm      → decade 整数（1960 代表 1960s 整十年）
   * 这里统一按 [STATE.from, STATE.to] 裁剪，保证三张图口径一致。
   */
  function eraStart(label) {
    var m = String(label || '').match(/^(\d{4})/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function inRange(y) { return y >= STATE.from && y <= STATE.to; }

  function eraRows() {
    var rows = ((RAW.duration || {}).era5) || [];
    return rows.filter(function (r) { return r.count >= 50 && inRange(eraStart(r.era5)); });
  }

  /* KPI 口径：只按年份裁剪，不套“最小样本 50 首”的绘图门槛，
     否则全区间合计会变成 28,330，比真实的 28,351 少 21 首，对不上账 */
  function eraRowsAll() {
    var rows = ((RAW.duration || {}).era5) || [];
    return rows.filter(function (r) { return inRange(eraStart(r.era5)); });
  }

  function loudRows() {
    var rows = ((RAW.loudness || {}).year) || [];
    return rows.filter(function (r) { return inRange(r.year); });
  }

  function bpmRows() {
    var rows = ((RAW.bpm || {}).decade) || [];
    return rows.filter(function (r) { return r.count >= 50 && inRange(r.decade); });
  }

  function scatterPts() {
    var pts = ((RAW.scatter || {}).points) || [];
    /* 旧快照没有 year 字段，此时跳过年代过滤，保证离线演示不炸 */
    pts = pts.filter(function (p) {
      return p.year === undefined || p.year === null || inRange(p.year);
    });
    if (STATE.genre) {
      pts = pts.filter(function (p) { return p.genre === STATE.genre; });
    }
    return pts;
  }

  /* 十年区间 d~d+9 是否该进矩阵：
     ① 与筛选窗口重叠 >=5 年（避免 1955–1959 这种只沾边的情况）
     ② 或者该年代的"起点"落在窗口内 —— 2020s 只覆盖 2020 一年，
        按 ① 永远进不来，但对"1955–2020"这个默认区间它是必须显示的 */
  function decadeInRange(d) {
    var lo = Math.max(d, STATE.from);
    var hi = Math.min(d + 9, STATE.to);
    return (hi - lo + 1) >= 5 || (d >= STATE.from && d <= STATE.to);
  }

  /* 一行里第一个 / 最后一个非空值。不能直接取首末列：
     edm 在 1960s–1990s 没有数据，取首列会让整行的"首尾变化"变成空 */
  function rowSpan(vals) {
    var first = null, last = null;
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (v === undefined || v === null) { continue; }
      if (first === null) { first = v; }
      last = v;
    }
    return [first, last];
  }

  /* ============================================================ 0. 核心矩阵
   * 曲风 × 年代 的平均响度。这张图要回答的是"响度战争是不是所有曲风一起打的"：
   * 全局均值在涨，但如果只有 rock/edm 在推、r&b 原地不动，那"响度战争"
   * 本质是曲风结构变化的副产物，不是所有音乐都变响了 —— 这才是最关键的对比。
   */
  var MX_LO = -11.5, MX_HI = -4.5;

  var MX_STOPS = [
    [0.00, '#17395f'],
    [0.26, '#24729c'],
    [0.50, '#4fbcb4'],
    [0.76, '#f5c95b'],
    [1.00, '#f0714a']
  ];

  function mxColor(v) {
    var t = clamp((v - MX_LO) / (MX_HI - MX_LO), 0, 1);
    for (var i = 1; i < MX_STOPS.length; i++) {
      if (t <= MX_STOPS[i][0]) {
        var t0 = MX_STOPS[i - 1][0], t1 = MX_STOPS[i][0];
        return lerpColor(MX_STOPS[i - 1][1], MX_STOPS[i][1], (t - t0) / (t1 - t0));
      }
    }
    return MX_STOPS[MX_STOPS.length - 1][1];
  }

  function mxInk(v) {
    return v >= (MX_LO + MX_HI) / 2 ? '#20130a' : '#e8f2ff';
  }

  /* 接口缺 data 时用抽样散点自己聚合，宁可给个"估算版"也不让核心位置空着 */
  function matrixModel() {
    var m = RAW.matrix;

    if (m && m.cell && m.cell.length) {
      return { cells: m.cell, base: m.decade || [], estimated: false };
    }

    var pts = (((RAW.scatter || {}).points) || []);
    var agg = {}, bas = {};

    pts.forEach(function (p) {
      if (p.year === undefined || p.year === null) { return; }
      var d = Math.floor(p.year / 10) * 10;
      var k = p.genre + '|' + d;
      agg[k] = agg[k] || { genre: p.genre, decade: d, n: 0, s: 0 };
      agg[k].n++; agg[k].s += p.loudness;
      bas[d] = bas[d] || { n: 0, s: 0 };
      bas[d].n++; bas[d].s += p.loudness;
    });

    var cells = Object.keys(agg).filter(function (k) { return agg[k].n >= 12; }).map(function (k) {
      var a = agg[k];
      return { genre: a.genre, decade: a.decade, cnt: a.n, avgLoudness: +(a.s / a.n).toFixed(2) };
    });

    var base = Object.keys(bas).map(function (d) {
      return { decade: +d, count: bas[d].n, avgLoudness: +(bas[d].s / bas[d].n).toFixed(2) };
    });

    return { cells: cells, base: base, estimated: true };
  }

  function renderMatrix() {
    var host = $('chartMatrix');
    if (!host) { return; }

    var model = matrixModel();
    var decs = {};

    model.cells.forEach(function (c) { if (decadeInRange(c.decade)) { decs[c.decade] = 1; } });
    /* 基线只补"曲风矩阵里没有、但全体有"的年代；样本过少的年代（1950s 仅 3 首）不参与，
       否则那一格会是假的"最响" */
    model.base.forEach(function (c) {
      var enough = model.estimated || c.count === undefined || c.count >= 30;
      if (enough && decadeInRange(c.decade)) { decs[c.decade] = 1; }
    });

    var decades = Object.keys(decs).map(Number).sort(function (a, b) { return a - b; });

    var chart = charts.matrix = charts.matrix || window.echarts.init(host);

    if (!decades.length) {
      chart.setOption({ xAxis: { type: 'category', data: [] }, yAxis: { type: 'category', data: [] }, series: [] }, true);
      $('mxTag').textContent = '无数据';
      $('mxFoot').textContent = '当前年代区间内没有足够的样本构成矩阵，请放宽区间（每格至少 30 首才计入）';
      return;
    }

    var val = {}, cnt = {};
    model.cells.forEach(function (c) {
      val[c.genre + '|' + c.decade] = c.avgLoudness;
      cnt[c.genre + '|' + c.decade] = c.cnt;
    });

    var baseVal = {}, baseCnt = {};
    model.base.forEach(function (c) {
      baseVal[c.decade] = c.avgLoudness;
      baseCnt[c.decade] = c.count;
    });

    /* 曲风按可见年代的平均响度排序：最响的排最上面，一眼看出梯队 */
    var gmap = {};
    model.cells.forEach(function (c) {
      if (!decadeInRange(c.decade)) { return; }
      var g = gmap[c.genre] = gmap[c.genre] || { genre: c.genre, s: 0, n: 0 };
      g.s += c.avgLoudness; g.n++;
    });
    var genres = Object.keys(gmap).map(function (k) { return gmap[k]; })
      .sort(function (a, b) { return (b.s / b.n) - (a.s / a.n); });

    var rows = genres.map(function (g) { return g.genre; }).concat(['全体']);

    var xLabels = decades.map(function (d) { return d + 's'; });
    var DX = xLabels.length;               /* "首尾变化" 列的下标 */
    xLabels.push('首尾变化');

    var data = [];
    var spans = {};

    function pushCell(xi, yi, v, n, label, isBase) {
      var border = isBase
        ? { borderColor: 'rgba(251,191,36,0.55)', borderWidth: 1 }
        : {};

      if (v === undefined || v === null) {
        data.push({
          value: [xi, yi, 0], txt: '—',
          itemStyle: mixStyle({ color: 'rgba(56,88,138,0.12)', borderRadius: 4 }, border),
          label: { color: '#405477' },
          tipHtml: '<b>' + esc(label) + '</b><br/>样本不足，未计入'
        });
        return;
      }

      data.push({
        value: [xi, yi, v], txt: fmt(v, 1),
        itemStyle: mixStyle({ color: mxColor(v), borderRadius: 4 }, border),
        label: { color: mxInk(v) },
        tipHtml: '<b>' + esc(label) + '</b><br/>平均响度 <b>' + fmt(v, 2) +
          ' dBFS</b><br/>样本 ' + fmt(n) + ' 首'
      });
    }

    function pushDelta(yi, first, last, label, isBase) {
      if (first === null || first === undefined || last === null || last === undefined) {
        data.push({
          value: [DX, yi, 0], txt: '—',
          itemStyle: { color: 'rgba(86,124,178,0.10)', borderRadius: 4 },
          label: { color: '#6b7f9f' },
          tipHtml: '<b>' + esc(label) + '</b><br/>可见年代不足两个，无法计算变化'
        });
        return;
      }

      var d = last - first;
      var up = d > 0.25, down = d < -0.25;
      var bg = up ? 'rgba(249,115,22,0.20)' : (down ? 'rgba(56,225,255,0.15)' : 'rgba(86,124,178,0.10)');
      var fg = up ? '#ffcf8a' : (down ? '#8fd8ff' : '#6b7f9f');
      var border = isBase ? { borderColor: 'rgba(251,191,36,0.4)', borderWidth: 1 } : {};

      data.push({
        value: [DX, yi, d],
        txt: (d > 0 ? '+' : (d < 0 ? '−' : '')) + fmt(Math.abs(d), 1),
        itemStyle: mixStyle({ color: bg, borderRadius: 4 }, border),
        label: { color: fg },
        tipHtml: '<b>' + esc(label) + '</b><br/>首个可见值 ' + fmt(first, 2) +
          ' dB → 末个可见值 ' + fmt(last, 2) + ' dB<br/>变化 <b>' + fmt(d, 2) + ' dB</b>'
      });
    }

    genres.forEach(function (g, yi) {
      var rowVals = decades.map(function (d) { return val[g.genre + '|' + d]; });
      var sp = rowSpan(rowVals);
      spans[g.genre] = sp;

      decades.forEach(function (d, xi) {
        pushCell(xi, yi, rowVals[xi], cnt[g.genre + '|' + d], g.genre + ' · ' + d + 's', false);
      });
      pushDelta(yi, sp[0], sp[1], g.genre, false);
    });

    var baseVals = decades.map(function (d) { return baseVal[d]; });
    var baseSp = rowSpan(baseVals);
    var yBase = genres.length;

    decades.forEach(function (d, xi) {
      pushCell(xi, yBase, baseVals[xi], baseCnt[d], '全体 · ' + d + 's', true);
    });
    pushDelta(yBase, baseSp[0], baseSp[1], '全体', true);

    var opt = {
      animation: false,
      /* bottom 只留 6px：色标条是 .mx-legend 这个 HTML 元素，紧接在画布下方，
         画布底部若再留 20px，矩阵格子与色标之间就会出现一条空带 */
      grid: { left: 74, right: 14, top: 8, bottom: 6 },
      tooltip: {
        trigger: 'item',
        formatter: function (p) { return (p.data && p.data.tipHtml) || ''; }
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        splitArea: { show: false },
        axisLabel: {
          /* 必须用 rich 富文本上色，不能给 color 传函数：
             ECharts 的 axisLabel.color 只接受颜色值，传函数会让整条轴的标签直接不渲染 */
          formatter: function (v, i) { return i === DX ? '{d|' + v + '}' : '{n|' + v + '}'; },
          rich: {
            n: { color: '#7d92b3', fontSize: 10.5 },
            d: { color: '#c99a4e', fontSize: 10.5, fontWeight: 600 }
          }
        }
      },
      yAxis: {
        type: 'category',
        data: rows,
        inverse: true,
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        splitArea: { show: false },
        axisLabel: {
          margin: 12,
          /* 同理用 rich：被选中的曲风行高亮成青色，"全体"行加粗 */
          formatter: function (v) {
            if (v === '全体') { return '{b|' + v + '}'; }
            return v === STATE.genre ? '{a|' + v + '}' : '{n|' + v + '}';
          },
          rich: {
            n: { color: '#8ba0c0', fontSize: 12 },
            a: { color: '#38e1ff', fontSize: 12, fontWeight: 600 },
            b: { color: '#e6f0ff', fontSize: 12, fontWeight: 700 }
          }
        }
      },
      series: [{
        name: '平均响度',
        type: 'heatmap',
        data: data,
        label: {
          show: true,
          fontSize: 12.5,
          fontWeight: 600,
          formatter: function (p) { return p.data.txt; }
        },
        itemStyle: { borderRadius: 4 },
        emphasis: { itemStyle: { borderColor: 'rgba(255,255,255,0.55)', borderWidth: 1 } }
      }]
    };

    chart.setOption(opt, true);

    /* 行标题点击 = 曲风筛选。真 ECharts 才有事件系统，轻量渲染器下自动跳过 */
    if (chart.on && !chart.__genreBound) {
      chart.on('click', function (p) {
        if (p.componentType !== 'yAxis') { return; }
        var g = p.value;
        if (!g || g === '全体') { return; }
        STATE.genre = (STATE.genre === g) ? '' : g;
        syncGenreUI();
        renderMatrix();
        renderScatter();
        renderGenreBars();
        renderFindings();
        syncRangeUI();
      });
      chart.__genreBound = true;
    }

    $('mxLo').textContent = fmt(MX_LO, 1) + ' dB 轻';
    $('mxHi').textContent = fmt(MX_HI, 1) + ' dB 响';

    /* 头部标签：给出"分化程度"这个最有信息量的数字 */
    var ds = [];
    genres.forEach(function (g) {
      var sp = spans[g.genre];
      if (sp[0] === null || sp[1] === null) { return; }
      ds.push({ g: g.genre, d: sp[1] - sp[0] });
    });
    ds.sort(function (x, y) { return y.d - x.d; });

    if (ds.length >= 2) {
      var hiD = ds[0], loD = ds[ds.length - 1];
      $('mxTag').textContent = '最猛 ' + hiD.g + ' +' + fmt(hiD.d, 1) + ' dB';
      $('mxFoot').textContent = genres.length + ' 曲风 × ' + decades.length + ' 年代　' +
        '推得最狠：' + hiD.g + ' +' + fmt(hiD.d, 1) + ' dB；变化最小：' + loD.g + ' ' +
        (loD.d >= 0 ? '+' : '−') + fmt(Math.abs(loD.d), 1) + ' dB' +
        '（首尾变化按各曲风首个有样本的年代计算）' +
        (model.estimated ? '　· 抽样估算，重启后端可得全量精确值' : '');
    } else {
      $('mxTag').textContent = decades.length + ' 个年代';
      $('mxFoot').textContent = '格内数字＝该曲风在该十年的平均响度（dBFS），越暖越响';
    }
  }

  /* 合并两个 itemStyle 对象，避免每个格子写两遍 */
  function mixStyle(a, b) {
    var o = {}, k;
    for (k in a) { if (a.hasOwnProperty(k)) { o[k] = a[k]; } }
    for (k in b) { if (b.hasOwnProperty(k)) { o[k] = b[k]; } }
    return o;
  }


  /* 结论口径的最小样本量，必须和后端 StatsService2.MIN_SAMPLE 保持一致。
     图表可以画样本少的年份（HAVING 20），但"涨了多少 dB"这种结论不能由 31 首歌的年份决定：
     1967 年只有 31 首，均值 −10.24，拿它当起点会把提升幅度算成 +4.4 dB；
     后端按 >=100 首的口径算出来是 1976 年起 +3.4 dB。两处必须同一把尺子。 */
  var MIN_N = 100;

  function solidRows(rows, n) {
    n = n || MIN_N;
    var out = rows.filter(function (r) { return (r.count || 0) >= n; });
    return out.length >= 2 ? out : rows;
  }

  /* 加权均值：用 count 当权重，避免样本量小的年份拉偏 */
  function wmean(rows, vk, ck) {
    var s = 0, w = 0;
    rows.forEach(function (r) {
      var v = r[vk], c = r[ck];
      if (v !== null && v !== undefined && c > 0) { s += v * c; w += c; }
    });
    return w ? s / w : null;
  }

  function sumBy(rows, k) {
    return rows.reduce(function (a, r) { return a + (r[k] || 0); }, 0);
  }

  function pearson(rows, kx, ky) {
    var n = rows.length;
    if (n < 3) { return null; }
    var sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    rows.forEach(function (r) {
      var x = r[kx], y = r[ky];
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    });
    var mx = sx / n, my = sy / n;
    var vx = sxx / n - mx * mx, vy = syy / n - my * my;
    if (vx <= 0 || vy <= 0) { return null; }
    return (sxy / n - mx * my) / Math.sqrt(vx * vy);
  }

  /* ============================================================ 1. 时长箱线图 */
  function renderDuration() {
    var eras = eraRows();
    var weighted = STATE.weighted;
    var wmap = {};
    ((RAW.duration || {}).era5Weighted || []).forEach(function (r) { wmap[r.era5] = r.wmedian; });

    if (!eras.length) {
      charts.duration = charts.duration || window.echarts.init($('chartDuration'));
      charts.duration.setOption({ xAxis: { type: 'category', data: [] }, yAxis: { type: 'value' }, series: [] }, true);
      $('durTag').textContent = '无数据';
      $('durFoot').textContent = '当前年代区间内没有满足最小样本量（50 首）的五年分组，请放宽区间';
      return;
    }

    var cats = eras.map(function (r) { return r.era5.slice(2, 4) + '–' + r.era5.slice(7, 9); });
    var box = eras.map(function (r) { return [r.min, r.q1, r.median, r.q3, r.max]; });
    var medians = eras.map(function (r) { return r.median; });
    var means = eras.map(function (r) { return r.mean; });
    var counts = eras.map(function (r) { return r.count; });
    var weightedMedians = eras.map(function (r) {
      return wmap[r.era5] === undefined ? r.median : wmap[r.era5];
    });

    var opt = {
      animation: false,
      grid: { left: 44, right: 12, top: 20, bottom: 36 },
      tooltip: {
        trigger: 'item',
        formatter: function (p) {
          if (p.seriesType && p.seriesType !== 'boxplot') { return ''; }
          var i = p.dataIndex;
          if (i === undefined || i === null) { return ''; }
          var v = p.data || box[i] || [];
          return '<b>' + cats[i] + '</b>　样本 ' + fmt(counts[i]) + '<br/>' +
            '等权中位数 ' + fmt(medians[i], 2) + '′<br/>' +
            '加权中位数 ' + fmt(weightedMedians[i], 2) + '′<br/>' +
            '最大值 ' + fmt(v[4], 2) + '′<br/>' +
            'P75　 ' + fmt(v[3], 2) + '′<br/>' +
            '中位数 ' + fmt(v[2], 2) + '′<br/>' +
            'P25　 ' + fmt(v[1], 2) + '′<br/>' +
            '最小值 ' + fmt(v[0], 2) + '′';
        }
      },
      xAxis: {
        type: 'category',
        data: cats,
        boundaryGap: true,
        axisLine: { lineStyle: { color: 'rgba(86,124,178,0.35)' } },
        axisTick: { show: false },
        axisLabel: { color: AXIS_COLOR, fontSize: 9.5, rotate: 30, interval: 0 }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 9,
        name: '分钟',
        nameTextStyle: { color: '#5f7395', fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: AXIS_COLOR, fontSize: 10, formatter: '{value}' },
        splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } }
      },
      series: [
        {
          name: '时长分布',
          type: 'boxplot',
          data: box,
          itemStyle: {
            color: 'rgba(77,141,255,0.28)',
            borderColor: '#5b9dff',
            borderWidth: 1.3
          }
        },
        /* 未选中的口径画淡一些，两条线始终可见 —— 这正是“口径稳健性”的证据 */
        {
          name: '等权中位数',
          type: 'line',
          data: medians,
          smooth: true,
          symbol: weighted ? 'none' : 'circle',
          symbolSize: 5,
          lineStyle: {
            width: weighted ? 1 : 2.2,
            color: weighted ? 'rgba(251,191,36,0.42)' : '#fbbf24'
          },
          itemStyle: { color: '#fbbf24' },
          z: weighted ? 3 : 5
        },
        {
          name: '歌单加权中位数',
          type: 'line',
          data: weightedMedians,
          smooth: false,
          symbol: weighted ? 'rect' : 'none',
          symbolSize: 5,
          lineStyle: {
            width: weighted ? 2.2 : 1.4,
            color: weighted ? '#f472b6' : 'rgba(244,114,182,0.62)',
            type: weighted ? 'solid' : 'dashed'
          },
          itemStyle: { color: '#f472b6' },
          z: weighted ? 7 : 4
        },
        {
          name: '均值',
          type: 'scatter',
          data: means.map(function (v) { return { value: v, symbolSize: 7 }; }),
          itemStyle: { color: 'rgba(232,238,252,0.75)' },
          z: 5
        }
      ]
    };

    charts.duration = charts.duration || window.echarts.init($('chartDuration'));
    charts.duration.setOption(opt, true);

    var last = eras[eras.length - 1];
    var lastVal = weighted ? weightedMedians[weightedMedians.length - 1] : last.median;
    $('durTag').textContent = (weighted ? '加权' : '等权') + '中位数 ' + fmt(lastVal, 2) + '′';

    var diff = 0;
    for (var i = 0; i < medians.length; i++) {
      diff = Math.max(diff, Math.abs(weightedMedians[i] - medians[i]));
    }
    $('durFoot').textContent = '箱体＝P25–P75，须＝min/max，◆＝均值；' +
      (weighted ? '粉色实线为歌单曝光加权，黄色变淡为对照' : '黄色为等权中位数，粉色虚线为歌单加权校验') +
      '，两线最大差 ' + fmt(diff, 2) + '′';
  }

  /* ============================================================ 2. 响度战争 */
  function renderLoudness() {
    var rows = loudRows();

    if (rows.length < 2) {
      charts.loudness = charts.loudness || window.echarts.init($('chartLoudness'));
      charts.loudness.setOption({ xAxis: { type: 'category', data: [] }, yAxis: { type: 'value' }, series: [] }, true);
      $('loudTag').textContent = '区间过窄';
      $('loudFoot').textContent = '当前年代区间内可用的年份不足 2 个，请放宽区间后再看趋势';
      return;
    }

    var years = rows.map(function (r) { return r.year; });
    var mean = rows.map(function (r) { return r.mean; });
    var p10 = rows.map(function (r) { return r.p10; });
    var p90 = rows.map(function (r) { return r.p90; });

    var dotSize = rows.length <= 4 ? 4 : 0;

    var opt = {
      animation: false,
      grid: { left: 44, right: 12, top: 20, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        formatter: function (p) {
          var i = p.dataIndex || 0;
          if (!rows[i]) { return ''; }
          return '<b>' + years[i] + ' 年</b>　样本 ' + fmt(rows[i].count) + '<br/>' +
            '年均值 ' + fmt(mean[i], 2) + ' dB<br/>' +
            '中位数 ' + fmt(rows[i].median, 2) + ' dB<br/>' +
            'P10–P90　' + fmt(p10[i], 2) + ' ~ ' + fmt(p90[i], 2);
        }
      },
      xAxis: {
        type: 'category',
        data: years,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(86,124,178,0.35)' } },
        axisTick: { show: false },
        axisLabel: {
          color: AXIS_COLOR,
          fontSize: 10,
          interval: function (i) { return years[i] % 10 === 0; }
        }
      },
      yAxis: {
        type: 'value',
        min: -17,
        max: -2,
        interval: 3,
        name: 'dBFS',
        nameTextStyle: { color: '#5f7395', fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: AXIS_COLOR, fontSize: 10, formatter: '{value}' },
        splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } }
      },
      series: [
        /* P10 / P90 画成两条淡虚线当"包络"，不做堆叠填充。
           堆叠面积在负值数据上会被画成"从轴顶糊下来一整块"，看起来像全图填充，
           读者会误以为阴影是"高于均值的部分"。两条边界线没有这个歧义。 */
        {
          name: 'P90',
          type: 'line',
          data: p90,
          symbol: 'none',
          smooth: true,
          lineStyle: { width: 1, color: 'rgba(56,225,255,0.34)', type: 'dashed' },
          silent: true,
          z: 2
        },
        {
          name: 'P10',
          type: 'line',
          data: p10,
          symbol: 'none',
          smooth: true,
          lineStyle: { width: 1, color: 'rgba(56,225,255,0.34)', type: 'dashed' },
          silent: true,
          z: 2
        },
        {
          name: '年均值',
          type: 'line',
          data: mean,
          smooth: true,
          symbol: dotSize ? 'circle' : 'none',
          symbolSize: dotSize,
          lineStyle: { width: 2.6, color: '#38e1ff' },
          z: 5
        }
      ]
    };

    charts.loudness = charts.loudness || window.echarts.init($('chartLoudness'));
    charts.loudness.setOption(opt, true);

    var solid = solidRows(rows);
    var first = solid[0], peak = solid[0];
    solid.forEach(function (r) { if (r.mean > peak.mean) { peak = r; } });
    var gain = peak.mean - first.mean;

    $('loudTag').textContent = (gain >= 0 ? '+' : '') + fmt(gain, 1) + ' dB';
    $('loudFoot').textContent = fmt(first.year) + ' 年 ' + fmt(first.mean, 1) + ' dB → ' +
      fmt(peak.year) + ' 年峰值 ' + fmt(peak.mean, 1) + ' dB，区间内提升 ' + fmt(gain, 1) +
      ' dB（起止年份均按 ≥' + MIN_N + ' 首计）';
  }

  /* ============================================================ 3. BPM 小提琴 */
  var BPM_MIN = 40, BPM_MAX = 220, BIN = 5;

  function gaussSmooth(arr, sigma) {
    var out = [], r = Math.ceil(sigma * 3);
    for (var i = 0; i < arr.length; i++) {
      var sum = 0, wsum = 0;
      for (var k = -r; k <= r; k++) {
        var j = i + k;
        if (j < 0 || j >= arr.length) { continue; }
        var w = Math.exp(-(k * k) / (2 * sigma * sigma));
        sum += arr[j] * w;
        wsum += w;
      }
      out.push(wsum ? sum / wsum : 0);
    }
    return out;
  }

  function renderBpm() {
    var decades = bpmRows();

    if (!decades.length) {
      charts.bpm = charts.bpm || window.echarts.init($('chartBpm'));
      charts.bpm.setOption({ xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: [] }, true);
      $('bpmFoot').textContent = '当前年代区间内没有满足最小样本量（50 首）的十年分组';
      return;
    }

    var labels = decades.map(function (r) { return r.decade + 's'; });
    var nBins = Math.round((BPM_MAX - BPM_MIN) / BIN);
    var hist = {};
    var keep = {};
    decades.forEach(function (d) { keep[d.decade] = true; });

    ((((RAW.bpm || {}).hist) || [])).forEach(function (r) {
      if (!keep[r.decade]) { return; }
      hist[r.decade] = hist[r.decade] || new Array(nBins).fill(0);
      var idx = Math.floor((r.bin - BPM_MIN) / BIN);
      if (idx >= 0 && idx < nBins) { hist[r.decade][idx] += r.cnt; }
    });

    var series = [];
    var maxWidth = 0.36;
    decades.forEach(function (d, i) {
      var raw = hist[d.decade] || new Array(nBins).fill(0);
      var total = raw.reduce(function (a, b) { return a + b; }, 0) || 1;
      var density = gaussSmooth(raw.map(function (c) { return c / total; }), 1.15);
      var peak = Math.max.apply(null, density) || 1;
      var center = i + 1;
      var color = PALETTE[i % PALETTE.length];
      var up = [], down = [];
      for (var b = 0; b < nBins; b++) {
        var x = BPM_MIN + b * BIN + BIN / 2;
        var w = density[b] / peak * maxWidth;
        up.push([x, +(center + w).toFixed(4)]);
        down.push([x, +(center - w).toFixed(4)]);
      }
      series.push({
        name: d.decade + 's 上半',
        type: 'line',
        data: up,
        symbol: 'none',
        smooth: true,
        lineStyle: { width: 1, color: color, opacity: 0.85 },
        areaStyle: { color: color, opacity: 0.26, origin: center },
        silent: true,
        z: 2
      });
      series.push({
        name: d.decade + 's 下半',
        type: 'line',
        data: down,
        symbol: 'none',
        smooth: true,
        lineStyle: { width: 1, color: color, opacity: 0.85 },
        areaStyle: { color: color, opacity: 0.26, origin: center },
        silent: true,
        z: 2
      });
    });

    series.push({
      name: '年代中位数',
      type: 'scatter',
      data: decades.map(function (d, i) { return { value: [d.median, i + 1], symbolSize: 6 }; }),
      itemStyle: { color: '#ffffff' },
      tooltip: {
        formatter: function (p) {
          var i = Math.round(p.value[1]) - 1;
          var d = decades[i] || {};
          return '<b>' + labels[i] + '</b>　样本 ' + fmt(d.count) + '<br/>' +
            '中位数 ' + fmt(d.median, 1) + ' BPM<br/>' +
            'P25–P75　' + fmt(d.q1, 1) + ' ~ ' + fmt(d.q3, 1) + '<br/>' +
            '115–125 BPM 占比 ' + fmt(d.share120, 1) + '%';
        }
      },
      z: 6
    });

    var opt = {
      animation: false,
      grid: { left: 48, right: 28, top: 16, bottom: 26 },
      tooltip: { trigger: 'item' },
      xAxis: {
        type: 'value',
        min: BPM_MIN,
        max: BPM_MAX,
        interval: 30,
        axisLine: { lineStyle: { color: 'rgba(86,124,178,0.35)' } },
        axisTick: { show: false },
        axisLabel: { color: AXIS_COLOR, fontSize: 10, showMaxLabel: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: decades.length + 1,
        interval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: AXIS_COLOR,
          fontSize: 10.5,
          formatter: function (v) {
            var i = Math.round(v) - 1;
            return (v % 1 === 0 && labels[i]) ? labels[i] : '';
          }
        },
        splitLine: { lineStyle: { color: 'rgba(86,124,178,0.10)' } }
      },
      series: series
    };

    if (opt.series.length) {
      opt.series[0].markLine = {
        silent: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(251,191,36,0.9)', width: 1.4, type: 'dashed' },
        data: [{ xAxis: 120, label: { formatter: '120 BPM 黄金律动', position: 'insideEndTop', color: '#fbbf24', fontSize: 10 } }]
      };
    }

    charts.bpm = charts.bpm || window.echarts.init($('chartBpm'));
    charts.bpm.setOption(opt, true);

    var slowest = decades[0], fastest = decades[0];
    decades.forEach(function (d) {
      if (d.median < slowest.median) { slowest = d; }
      if (d.median > fastest.median) { fastest = d; }
    });
    $('bpmFoot').textContent = '最慢 ' + slowest.decade + 's ' + fmt(slowest.median, 1) +
      ' BPM，最快 ' + fastest.decade + 's ' + fmt(fastest.median, 1) + ' BPM；宽度＝该 BPM 区间的相对密度';
  }

  /* ============================================================ 4. 散点
   * 按"时长 × 响度"四象限着色，而不是按连续流行度着色。
   * 原因：连续色阶只能看出一团雾，四象限才能直接读出"短且响 41.5 分 vs 长且轻 36.6 分"
   * 这个对比结论 —— 那张图的意义就在这一句话上。
   */
  var QUADS = [
    { k: 'sl', name: '短且响', color: '#fbbf24', cond: function (p) { return p.duration < 3.5 && p.loudness >= -6; } },
    { k: 'sq', name: '短且轻', color: '#4d8dff', cond: function (p) { return p.duration < 3.5 && p.loudness < -6; } },
    { k: 'll', name: '长且响', color: '#f472b6', cond: function (p) { return p.duration >= 3.5 && p.loudness >= -6; } },
    { k: 'lq', name: '长且轻', color: '#64789c', cond: function (p) { return p.duration >= 3.5 && p.loudness < -6; } }
  ];

  function quadOf(p) {
    for (var i = 0; i < QUADS.length; i++) {
      if (QUADS[i].cond(p)) { return QUADS[i]; }
    }
    return QUADS[3];
  }

  function renderScatter() {
    var pts = scatterPts();

    if (!pts.length) {
      charts.scatter = charts.scatter || window.echarts.init($('chartScatter'));
      charts.scatter.setOption({ xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: [] }, true);
      $('scatterTag').textContent = 'n = 0';
      $('scatterFoot').textContent = '该曲风在抽样散点中没有可用记录，请切换曲风';
      return;
    }

    var bucket = {}, stat = {};
    QUADS.forEach(function (q) { stat[q.k] = { n: 0, s: 0 }; });

    pts.forEach(function (p) {
      var q = quadOf(p);
      (bucket[q.k] = bucket[q.k] || []).push({
        value: [+p.duration.toFixed(2), +p.loudness.toFixed(2), p.popularity],
        symbolSize: 3 + (p.popularity / 100) * 7,
        itemStyle: { color: q.color, opacity: 0.55 }
      });
      stat[q.k].n++;
      stat[q.k].s += p.popularity;
    });

    var series = QUADS.map(function (q) {
      return {
        name: q.name,
        type: 'scatter',
        data: bucket[q.k] || [],
        z: 3
      };
    });

    /* 分割线挂在第一个系列上，两条线就把画面切成四块 */
    series[0].markLine = {
      silent: true,
      symbol: 'none',
      lineStyle: { color: 'rgba(251,191,36,0.5)', width: 1, type: 'dashed' },
      data: [
        { xAxis: 3.5, label: { formatter: '3.5′', color: '#fbbf24', fontSize: 9, position: 'insideEndTop' } },
        { yAxis: -6, label: { formatter: '−6 dB', color: '#fbbf24', fontSize: 9, position: 'insideEndTop' } }
      ]
    };

    var opt = {
      animation: false,
      grid: { left: 42, right: 24, top: 16, bottom: 26 },
      tooltip: {
        trigger: 'item',
        formatter: function (p) {
          var v = p.value || [];
          return (p.seriesName || '') + '<br/>' +
            '时长 ' + fmt(v[0], 2) + '′　响度 ' + fmt(v[1], 2) + ' dB<br/>' +
            '流行度 <b>' + fmt(v[2]) + '</b>';
        }
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 9.4,
        name: '分钟',
        nameTextStyle: { color: '#5f7395', fontSize: 10 },
        axisLine: { lineStyle: { color: 'rgba(86,124,178,0.35)' } },
        axisTick: { show: false },
        axisLabel: { color: AXIS_COLOR, fontSize: 10, showMaxLabel: false },
        splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } }
      },
      yAxis: {
        type: 'value',
        min: -16,
        max: 2,
        interval: 3,
        name: 'dBFS',
        nameTextStyle: { color: '#5f7395', fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: AXIS_COLOR, fontSize: 10 },
        splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } }
      },
      series: series
    };

    charts.scatter = charts.scatter || window.echarts.init($('chartScatter'));
    charts.scatter.setOption(opt, true);

    var rDur = pearson(pts, 'duration', 'popularity');
    var rLoud = pearson(pts, 'loudness', 'popularity');
    $('scatterTag').textContent = 'n = ' + fmt(pts.length) +
      (rDur === null ? '' : ' · r=' + fmt(rDur, 2));

    /* 图例直接带平均流行度 —— 四象限的对比结论写在图例里，不用去数点 */
    var legend = QUADS.map(function (q) {
      var s = stat[q.k];
      var avg = s.n ? s.s / s.n : null;
      return '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:9px;' +
        'opacity:' + (s.n ? 1 : 0.35) + ';">' +
        '<i style="width:6px;height:6px;border-radius:50%;background:' + q.color + ';display:inline-block;"></i>' +
        q.name + ' <b style="color:#dfeaff;">' + fmt(avg, 1) + '</b>' +
        '<em style="font-style:normal;color:#5f7395;">(' + fmt(s.n) + ')</em></span>';
    }).join('');

    $('scatterFoot').innerHTML = legend + '　<span style="color:#5f7395;">时长 r=' +
      fmt(rDur, 3) + '，响度 r=' + fmt(rLoud, 3) + '</span>';
  }

  /* ============================================================ KPI / 结论 */

  /* KPI 数值：一律同步写终值，视觉反馈交给 CSS 的 .pop 动画。
     不要用 rAF 逐帧插值——后台标签页/无头环境里 rAF 会被挂起，
     那样数字会永远停在旧值（踩过：DOM 已是 25,719，界面还显示 28,351）。 */
  function setKpi(id, val, digits) {
    var el = $(id);
    if (!el) { return; }
    var txt = fmt(val, digits);
    if (el.textContent === txt) { return; }
    el.textContent = txt;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  function renderKpi() {
    var eras = eraRowsAll();
    var yrs = loudRows();
    var dec = ((RAW.bpm || {}).decade) || [];
    dec = dec.filter(function (r) { return inRange(r.decade); });

    var tracks = sumBy(eras, 'count');
    setKpi('kpiTracks', tracks, 0);
    setKpi('kpiDuration', wmean(eras, 'mean', 'count'), 2);
    setKpi('kpiLoudness', wmean(yrs, 'mean', 'count'), 2);
    setKpi('kpiShort', wmean(eras, 'shortPct', 'count'), 1);
    setKpi('kpiTempo', wmean(dec, 'mean', 'count'), 0);

    var lo = ((RAW.overview || {}).overview) || {};
    $('kpiTracksNote').textContent = (STATE.from === YEAR_MIN && STATE.to === YEAR_MAX)
      ? '覆盖 ' + fmt(lo.artists) + ' 位艺人 · ' + fmt(lo.genres) + ' 种曲风'
      : '当前区间筛选后 · 全库 ' + fmt(lo.totalTracks) + ' 首';

    if (eras.length) {
      var first = eras[0], last = eras[eras.length - 1];
      $('kpiDurationNote').textContent = first.era5 + ' 的 ' + fmt(first.median, 2) + '′ → ' +
        last.era5 + ' 的 ' + fmt(last.median, 2) + '′';
    } else {
      $('kpiDurationNote').textContent = '区间内样本不足';
    }

    if (yrs.length) {
      var solidY = solidRows(yrs);
      var peak = solidY[0];
      solidY.forEach(function (r) { if (r.mean > peak.mean) { peak = r; } });
      $('kpiLoudnessNote').textContent = solidY[0].year + ' → ' + peak.year + ' 响度提升 ' +
        fmt(peak.mean - solidY[0].mean, 1) + ' dB';
    } else {
      $('kpiLoudnessNote').textContent = '区间内样本不足';
    }

    $('kpiShortNote').textContent = '超过 5 分钟的仅占 ' + fmt(lo.longPct, 1) + '%';
  }

  function renderGenreBars() {
    var host = $('genreBars');
    if (!host) { return; }
    var genres = (((RAW.overview || {}).genre) || []).slice(0, 6);
    host.innerHTML = '';
    var lo = -9.5, hi = -4.5;
    genres.forEach(function (g) {
      var pct = Math.max(6, Math.min(100, (g.avgLoudness - lo) / (hi - lo) * 100));
      var row = document.createElement('div');
      row.className = 'bar-row' + (STATE.genre === g.genre ? ' active' : '');
      row.setAttribute('data-genre', g.genre);
      row.title = '点击只看 ' + g.genre + ' 的散点';
      row.innerHTML = '<span>' + esc(g.genre) + '</span>' +
        '<div class="track"><div class="fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '<b>' + fmt(g.avgLoudness, 1) + '</b>';
      row.addEventListener('click', function () {
        STATE.genre = (STATE.genre === g.genre) ? '' : g.genre;
        syncGenreUI();
        renderMatrix();
        renderScatter();
        renderGenreBars();
        renderFindings();
        syncRangeUI();
      });
      host.appendChild(row);
    });
  }

  function renderFindings() {
    var ul = $('findings');
    if (!ul || !RAW) { return; }

    var eras = eraRows();
    var yrs = loudRows();
    var dec = bpmRows();
    var pts = scatterPts();
    var items = [];

    /* ① 时长 */
    if (eras.length >= 2) {
      var peak = eras[0];
      eras.forEach(function (r) { if (r.median > peak.median) { peak = r; } });
      var last = eras[eras.length - 1];
      var pct = (last.median - peak.median) / peak.median * 100;
      items.push('时长确实在缩短：中位数从 <b>' + esc(peak.era5) + '</b> 的 <b>' + fmt(peak.median, 2) +
        '′</b> 降到 <b>' + esc(last.era5) + '</b> 的 <b>' + fmt(last.median, 2) + '′</b>，变动 <em>' +
        fmt(pct, 1) + '%</em>，但须线仍在 6–8′，长尾并没有消失。');
    } else {
      items.push('当前年代区间内可比的五年分组不足 2 个，时长趋势暂无法比较，请放宽区间。');
    }

    /* ② 响度 */
    if (yrs.length >= 2) {
      var solidY2 = solidRows(yrs);
      var lp = solidY2[0];
      solidY2.forEach(function (r) { if (r.mean > lp.mean) { lp = r; } });
      items.push('响度战争真实存在：<b>' + fmt(solidY2[0].year) + '</b> 年的年均值 <b>' +
        fmt(solidY2[0].mean, 1) + ' dB</b>，到 <b>' + fmt(lp.year) + '</b> 年抬到 <b>' +
        fmt(lp.mean, 1) + ' dB</b>，区间内提升 <em>' + fmt(lp.mean - solidY2[0].mean, 1) +
        ' dB</em>；折算下来相当于把播放音量推响了一倍多。');
    }

    /* ②b 曲风分化 —— 核心图 matrix 的文字结论 */
    var mx = matrixModel();
    if (mx.cells.length) {
      var mv = {};
      mx.cells.forEach(function (c) {
        if (!decadeInRange(c.decade)) { return; }
        mv[c.genre] = mv[c.genre] || {};
        mv[c.genre][c.decade] = c.avgLoudness;
      });

      var ds = [];
      Object.keys(mv).forEach(function (g) {
        var ks = Object.keys(mv[g]).map(Number).sort(function (a, b) { return a - b; });
        if (ks.length < 2) { return; }
        ds.push({
          g: g,
          d: mv[g][ks[ks.length - 1]] - mv[g][ks[0]],
          from: ks[0],
          to: ks[ks.length - 1]
        });
      });
      ds.sort(function (a, b) { return b.d - a.d; });

      if (ds.length >= 2) {
        var top = ds[0], bot = ds[ds.length - 1];
        items.push('响度战争不是齐步走：<b>' + esc(top.g) + '</b> 在 ' + top.from + 's–' + top.to +
          's 推高了 <em>' + fmt(top.d, 1) + ' dB</em>，而 <b>' + esc(bot.g) + '</b> 在 ' +
          bot.from + 's–' + bot.to + 's 只动了 <em>' + fmt(bot.d, 1) +
          ' dB</em>。"全体变响"主要是这几条陡线拽上去的，不是所有音乐同步变响。');
      }
    }

    /* ③ BPM */
    if (dec.length >= 2) {
      var slow = dec[0], fast = dec[0];
      dec.forEach(function (d) {
        if (d.median < slow.median) { slow = d; }
        if (d.median > fast.median) { fast = d; }
      });
      var latest = dec[dec.length - 1];
      items.push('节奏没有单调变快：<b>' + slow.decade + 's</b> 探到 <b>' + fmt(slow.median, 1) +
        ' BPM</b>，<b>' + fast.decade + 's</b> 又抬到 <b>' + fmt(fast.median, 1) + ' BPM</b>，' +
        '<b>' + latest.decade + 's</b> 收在 <b>' + fmt(latest.median, 1) + ' BPM</b>；115–125 BPM 区间仍吸纳 <em>' +
        fmt(latest.share120, 1) + '%</em> 的曲目。');
    }

    /* ④ 相关（随曲风筛选实时重算） */
    if (pts.length >= 3) {
      var rDur = pearson(pts, 'duration', 'popularity');
      var rLoud = pearson(pts, 'loudness', 'popularity');
      var quad = {};
      pts.forEach(function (p) {
        var dk = p.duration >= 3.5 ? 'long' : 'short';
        var lk = p.loudness >= -6 ? 'loud' : 'quiet';
        var k = dk + '-' + lk;
        quad[k] = quad[k] || { n: 0, s: 0 };
        quad[k].n++; quad[k].s += p.popularity;
      });
      var sl = quad['short-loud'], lq = quad['long-quiet'];
      items.push('“短且响”只是弱相关' + (STATE.genre ? '（仅 ' + esc(STATE.genre) + '）' : '') +
        '：时长与流行度 <em>r = ' + fmt(rDur, 3) + '</em>，响度与流行度 <em>r = ' + fmt(rLoud, 3) +
        '</em>；不过“短且响”组平均流行度 <b>' + fmt(sl && sl.n ? sl.s / sl.n : null, 1) +
        '</b>，仍高于“长且轻”组的 <b>' + fmt(lq && lq.n ? lq.s / lq.n : null, 1) + '</b>。');
    }

    /* ⑤ 曲风构成 */
    var allGenres = (((RAW.overview || {}).genre) || []);
    if (allGenres.length >= 2) {
      var sorted = allGenres.slice().sort(function (a, b) { return b.avgLoudness - a.avgLoudness; });
      var loudest = sorted[0], quietest = sorted[sorted.length - 1];
      items.push('曲风结构也有份：最响的 <b>' + esc(loudest.genre) + '</b> 达 <b>' + fmt(loudest.avgLoudness, 1) +
        ' dB</b>，最轻的 <b>' + esc(quietest.genre) + '</b> 只有 <b>' + fmt(quietest.avgLoudness, 1) +
        ' dB</b>，说明年代间的响度差异里有相当一部分来自曲风构成变化。');
    }

    ul.innerHTML = items.map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }

  function renderQuality(q) {
    var host = $('funnel');
    if (!q) { host.innerHTML = '<div class="funnel-row"><span>清洗报告缺失</span><b>—</b></div>'; return; }
    var ruleSum = 0;
    if (q.removed_by_rule) {
      Object.keys(q.removed_by_rule).forEach(function (k) { ruleSum += q.removed_by_rule[k]; });
    }
    var rows = [
      { t: '原始播放列表记录', v: fmt(q.source_rows), cls: '' },
      { t: '跨歌单重复（已去重）', v: '−' + fmt(q.cross_playlist_duplicates), cls: 'loss' },
      { t: '异常值 / 越界（已剔除）', v: '−' + fmt(ruleSum), cls: 'loss' },
      { t: '入库有效曲目', v: fmt(q.clean_rows), cls: 'final' }
    ];
    host.innerHTML = rows.map(function (r) {
      return '<div class="funnel-row ' + r.cls + '"><span>' + r.t + '</span><b>' + r.v + '</b></div>';
    }).join('');
  }

  /* ============================================================ 统一刷新 */
  var rafPending = false;

  function applyFilters() {
    if (!RAW) { return; }
    renderMatrix();     /* 先画核心图：它是整个看板的论点，其余四张是论据 */
    renderDuration();
    renderLoudness();
    renderBpm();
    renderScatter();
    renderKpi();
    renderFindings();
    syncRangeUI();
  }

  function scheduleApply() {
    if (rafPending) { return; }
    rafPending = true;
    var done = false;
    function run() {
      if (done) { return; }
      done = true;
      rafPending = false;
      applyFilters();
    }
    /* rAF 负责合并同一帧内的连续拖动；定时器兜底，
       因为标签页切到后台时 rAF 会被浏览器挂起，只靠它会永远不刷新 */
    requestAnimationFrame(run);
    setTimeout(run, 60);
  }

  function resizeAll() {
    Object.keys(charts).forEach(function (k) {
      if (charts[k] && charts[k].resize) {
        try { charts[k].resize(); } catch (e) { /* 忽略 */ }
      }
    });
  }

  /* ============================================================ 交互：年代区间 */
  function syncRangeUI() {
    var rf = $('rangeFrom'), rt = $('rangeTo');
    if (!rf || !rt) { return; }
    rf.value = STATE.from;
    rt.value = STATE.to;

    var span = YEAR_MAX - YEAR_MIN;
    var a = (STATE.from - YEAR_MIN) / span * 100;
    var b = (STATE.to - YEAR_MIN) / span * 100;
    var fill = $('rangeFill');
    fill.style.left = a + '%';
    fill.style.width = Math.max(0, b - a) + '%';

    $('rangeText').textContent = STATE.from + ' – ' + STATE.to;
    $('filterHint').textContent = (STATE.from === YEAR_MIN && STATE.to === YEAR_MAX && !STATE.genre)
      ? '拖动滑块或点击曲风柱可交叉筛选'
      : '已筛选：' + STATE.from + '–' + STATE.to + (STATE.genre ? ' · ' + STATE.genre : '');
  }

  function setRange(from, to, opts) {
    from = clamp(Math.round(from / YEAR_STEP) * YEAR_STEP, YEAR_MIN, YEAR_MAX - YEAR_STEP);
    to = clamp(Math.round(to / YEAR_STEP) * YEAR_STEP, YEAR_MIN + YEAR_STEP, YEAR_MAX);
    if (to - from < YEAR_STEP) {
      if (opts && opts.edge === 'from') { from = to - YEAR_STEP; }
      else { to = from + YEAR_STEP; }
    }
    from = clamp(from, YEAR_MIN, YEAR_MAX - YEAR_STEP);
    to = clamp(to, YEAR_MIN + YEAR_STEP, YEAR_MAX);
    if (from === STATE.from && to === STATE.to) { return; }
    STATE.from = from;
    STATE.to = to;
    scheduleApply();
  }

  /* ============================================================ 交互：回放 */
  function updatePlayBtn() {
    var btn = $('btnPlay');
    if (!btn) { return; }
    btn.classList.toggle('on', STATE.playing);
    $('btnPlayText').textContent = STATE.playing ? '暂停' : '回放';
  }

  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    STATE.playing = false;
    updatePlayBtn();
  }

  function togglePlay() {
    if (STATE.playing) { stopPlay(); return; }

    /* 回放从一个较窄的窗口开始，逐步向 2020 推进 */
    STATE.from = YEAR_MIN;
    STATE.to = clamp(YEAR_MIN + 15, YEAR_MIN + YEAR_STEP, YEAR_MAX);
    STATE.playing = true;
    updatePlayBtn();
    applyFilters();

    playTimer = setInterval(function () {
      var next = STATE.to + YEAR_STEP;
      if (next > YEAR_MAX) { stopPlay(); return; }
      STATE.to = next;
      applyFilters();
    }, 620);
  }

  /* ============================================================ 交互：口径 */
  function setWeighted(on) {
    STATE.weighted = !!on;
    var seg = $('segWeight');
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', (b.getAttribute('data-w') === '1') === STATE.weighted);
    });
    renderDuration();
  }

  /* ============================================================ 交互：曲风 */
  function buildGenreSelect() {
    var sel = $('scatterGenre');
    if (!sel) { return; }
    var genres = (((RAW.overview || {}).genre) || []).slice().sort(function (a, b) { return b.cnt - a.cnt; });
    genres.forEach(function (g, i) {
      GENRE_COLOR[g.genre] = PALETTE[i % PALETTE.length];
      var o = document.createElement('option');
      o.value = g.genre;
      o.textContent = g.genre + ' · ' + fmt(g.cnt);
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      STATE.genre = sel.value;
      renderMatrix();
      renderScatter();
      renderGenreBars();
      renderFindings();
      syncRangeUI();
    });
  }

  function syncGenreUI() {
    var sel = $('scatterGenre');
    if (sel) { sel.value = STATE.genre; }
  }

  /* ============================================================ 交互：面板放大 */
  function closeMax() {
    var cur = document.querySelector('.panel.max');
    if (!cur) { return; }
    cur.classList.remove('max');
    $('backdrop').classList.remove('on');
    STATE.maxChart = null;
    setTimeout(resizeAll, 80);
  }

  function toggleMax(key) {
    var cur = document.querySelector('.panel.max');
    var curKey = cur ? cur.getAttribute('data-chart') : null;
    if (cur) {
      closeMax();
      if (curKey === key) { return; }
    }
    var panel = document.querySelector('.panel[data-chart="' + key + '"]');
    if (!panel) { return; }
    panel.classList.add('max');
    $('backdrop').classList.add('on');
    STATE.maxChart = key;
    setTimeout(resizeAll, 80);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function () { /* 忽略 */ });
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(function () { /* 忽略 */ });
    }
  }

  /* ============================================================ 交互：重置 */
  function resetAll() {
    stopPlay();
    STATE.from = YEAR_MIN;
    STATE.to = YEAR_MAX;
    STATE.genre = '';
    STATE.colorBy = 'pop';
    STATE.weighted = false;
    if ($('scatterColor')) {
      $('scatterColor').textContent = '按流行度';
      $('scatterColor').classList.remove('on');
    }
    syncGenreUI();
    var seg = $('segWeight');
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-w') === '0');
    });
    closeMax();
    applyFilters();
    renderGenreBars();
  }

  /* ============================================================ 事件绑定 */
  function bindUI() {
    var rf = $('rangeFrom'), rt = $('rangeTo');

    rf.addEventListener('input', function () {
      stopPlay();
      setRange(+rf.value, STATE.to, { edge: 'from' });
    });
    rt.addEventListener('input', function () {
      stopPlay();
      setRange(STATE.from, +rt.value, { edge: 'to' });
    });

    $('btnPlay').addEventListener('click', togglePlay);
    $('btnReset').addEventListener('click', resetAll);
    $('btnFull').addEventListener('click', toggleFullscreen);

    var seg = $('segWeight');
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { setWeighted(b.getAttribute('data-w') === '1'); });
    });

    var colorBtn = $('scatterColor');
    if (colorBtn) {
      colorBtn.addEventListener('click', function () {
        STATE.colorBy = STATE.colorBy === 'pop' ? 'genre' : 'pop';
        colorBtn.textContent = STATE.colorBy === 'pop' ? '按流行度' : '按曲风';
        colorBtn.classList.toggle('on', STATE.colorBy === 'genre');
        renderScatter();
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.zoom-btn'), function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleMax(btn.getAttribute('data-chart'));
      });
    });

    $('backdrop').addEventListener('click', closeMax);

    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) { return; }
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'r' || e.key === 'R') { resetAll(); }
      else if (e.key === 'Escape') { closeMax(); }
      else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); }
    });
  }

  /* ------------------------------------------------------------ 时钟 */
  function startClock() {
    function tick() {
      var d = new Date();
      var p = function (x) { return x < 10 ? '0' + x : '' + x; };
      $('clockTime').textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      $('clockDate').textContent = d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate());
    }
    tick();
    setInterval(tick, 1000);
  }

  function bindResize() {
    var timer = null;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        Object.keys(charts).forEach(function (k) { charts[k] && charts[k].resize(); });
      }, 160);
    });
  }

  /* ------------------------------------------------------------ 引擎加载
   * 优先 CDN 上的真 ECharts；超时/失败则加载项目内置的轻量渲染器。
   * 这样内网、断网、答辩现场没网都能出图，而业务代码始终是标准 ECharts 配置。
   */
  var CDN_LIST = [
    'https://registry.npmmirror.com/echarts/5.5.0/files/dist/echarts.min.js',
    'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js',
    'https://unpkg.com/echarts@5.5.0/dist/echarts.min.js'
  ];

  function loadScript(src, timeout) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error('timeout: ' + src)); }
      }, timeout);
      el.async = true;
      el.src = src;
      el.onload = function () {
        if (settled) { return; }
        settled = true; clearTimeout(timer); resolve();
      };
      el.onerror = function () {
        if (settled) { return; }
        settled = true; clearTimeout(timer); reject(new Error('load error: ' + src));
      };
      document.head.appendChild(el);
    });
  }

  function ensureEngine() {
    if (window.echarts && window.echarts.init) { return Promise.resolve(); }
    var i = 0;
    function tryNext(reason) {
      if (i >= CDN_LIST.length) {
        console.warn('[dashboard] CDN 均不可用（' + reason + '），改用内置轻量渲染器');
        return loadScript('js/echarts-lite.js', 6000);
      }
      var url = CDN_LIST[i++];
      return loadScript(url, 2000).then(function () {
        if (!window.echarts || !window.echarts.init) { throw new Error('not ready'); }
      }).catch(function (err) {
        return tryNext(err.message);
      });
    }
    return tryNext('init');
  }

  /* ------------------------------------------------------------ 启动 */
  /* 支持 ?from=1990&to=2015&genre=edm 直接进入某个筛选态：
     答辩时不用现场拖滑块，也方便做筛选态的回归验证 */
  function applyQuery() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }

    var f = parseInt(q.get('from'), 10);
    var t = parseInt(q.get('to'), 10);

    if (!isNaN(f)) { STATE.from = clamp(f, YEAR_MIN, YEAR_MAX - YEAR_STEP); }
    if (!isNaN(t)) { STATE.to = clamp(t, YEAR_MIN + YEAR_STEP, YEAR_MAX); }
    if (STATE.to <= STATE.from) { STATE.to = Math.min(YEAR_MAX, STATE.from + YEAR_STEP); }

    var g = q.get('genre');
    if (g) { STATE.genre = g; }
  }

  function boot() {
    startClock();
    bindResize();
    bindUI();

    getJSON(QUALITY).then(renderQuality).catch(function () { renderQuality(null); });

    loadAll().then(function (data) {
      RAW = data;
      buildGenreSelect();
      applyQuery();
      syncGenreUI();
      applyFilters();
      renderGenreBars();

      var engine = window.__ECHARTS_LITE__ ? '内置轻量渲染' : ('ECharts ' + (window.echarts.version || ''));
      if (data.__source === 'api') {
        setStatus(true, '接口已连接 · MySQL / ' + engine);
      } else {
        setStatus(false, '接口离线 · 本地快照 / ' + engine);
      }
      window.__DASH__ = { data: data, charts: charts, state: STATE, engine: engine, apply: applyFilters };
    }).catch(function (err) {
      console.error(err);
      setStatus(false, '数据加载失败');
    });
  }

  function start() {
    ensureEngine().then(boot).catch(function (err) {
      console.error(err);
      setStatus(false, '图表引擎加载失败');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
