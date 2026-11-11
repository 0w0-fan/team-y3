/* ==========================================================================
 * echarts-lite.js  ——  离线兜底渲染器
 *
 * 只有在 CDN 上的 ECharts 没能加载（断网 / 内网环境）时才会生效。
 * 它实现了本项目用到的 ECharts option 子集：
 *   xAxis: category / value     yAxis: value
 *   series: boxplot / line(+areaStyle, stack) / scatter
 *   以及 markLine、axisLabel.formatter / rotate / interval 等配置
 * 也就是说 screen.js 里写的是标准 ECharts 配置，联网时走真 ECharts，
 * 断网时由这份文件按同一份 option 画出来，业务代码零改动。
 * ========================================================================== */
(function (global) {
  'use strict';

  var hasReal = global.echarts && typeof global.echarts.init === 'function';
  if (hasReal) { return; }

  var FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

  /* ------------------------------------------------------------ 颜色工具 */
  function rgba(c, a) {
    if (typeof c !== 'string') { return c; }
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
      var n = parseInt(h, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return c;
  }

  function makePaint(ctx, color, rect) {
    if (!color) { return 'rgba(0,0,0,0)'; }
    if (typeof color === 'string') { return color; }
    if (color.type === 'linear') {
      var g = ctx.createLinearGradient(
        rect.x + (color.x || 0) * rect.w,
        rect.y + (color.y || 0) * rect.h,
        rect.x + (color.x2 === undefined ? 0 : color.x2) * rect.w,
        rect.y + (color.y2 === undefined ? 1 : color.y2) * rect.h
      );
      (color.colorStops || []).forEach(function (s) { g.addColorStop(s.offset, s.color); });
      return g;
    }
    if (color.type === 'radial') {
      var g2 = ctx.createRadialGradient(rect.x + rect.w / 2, rect.y + rect.h / 2, 0,
        rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(rect.w, rect.h) / 2);
      (color.colorStops || []).forEach(function (s) { g2.addColorStop(s.offset, s.color); });
      return g2;
    }
    return 'rgba(0,0,0,0)';
  }

  /* ------------------------------------------------------------ 数值轴刻度 */
  function niceTicks(min, max, count) {
    var span = max - min;
    if (!(span > 0)) { return { ticks: [min], step: 1 }; }
    var raw = span / (count || 5);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag, step;
    if (norm <= 1) { step = 1; }
    else if (norm <= 2) { step = 2; }
    else if (norm <= 2.5) { step = 2.5; }
    else if (norm <= 5) { step = 5; }
    else { step = 10; }
    step *= mag;
    var start = Math.ceil(min / step) * step;
    var ticks = [];
    for (var v = start; v <= max + step * 1e-6; v += step) {
      ticks.push(Math.round(v * 1e6) / 1e6);
    }
    return { ticks: ticks, step: step };
  }

  /* 富文本 {style|text} 取纯文本：screen.js 用 rich 给轴标签上色，
     轻量渲染器没有富文本排版，至少把标记剥掉，别把 "{n|1960s}" 原样画出来 */
  function stripRich(t) {
    return String(t).replace(/\{[a-zA-Z0-9_]+\|([^}]*)\}/g, '$1');
  }

  function fmtNumber(v) {
    if (Math.abs(v) >= 1000) { return String(Math.round(v)); }
    return String(Math.round(v * 100) / 100);
  }

  /* ------------------------------------------------------------ 图表实例 */
  function LiteChart(dom) {
    var self = this;
    this.dom = dom;
    this.option = null;
    this.hits = [];
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;';
    dom.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.tip = document.createElement('div');
    this.tip.style.cssText = [
      'position:absolute;pointer-events:none;z-index:9;padding:6px 9px;',
      'font:11px/1.6 ' + FONT + ';color:#e8eefc;background:rgba(9,16,30,.94);',
      'border:1px solid rgba(86,140,205,.5);border-radius:5px;',
      'box-shadow:0 8px 22px rgba(0,0,0,.5);opacity:0;transition:opacity .12s;',
      'white-space:nowrap;transform:translate(-50%,-120%);'
    ].join('');
    dom.appendChild(this.tip);

    this._onMove = function (e) { self._hover(e); };
    this._onLeave = function () { self.tip.style.opacity = 0; };
    dom.addEventListener('mousemove', this._onMove);
    dom.addEventListener('mouseleave', this._onLeave);

    var resize = function () { self.render(); };
    if (global.ResizeObserver) {
      this._ro = new ResizeObserver(resize);
      this._ro.observe(dom);
    } else {
      global.addEventListener('resize', resize);
      this._fallbackResize = resize;
    }
    this.render();
  }

  LiteChart.prototype.setOption = function (opt) {
    this.option = opt;
    this.render();
  };

  LiteChart.prototype.resize = function () { this.render(); };

  LiteChart.prototype.dispose = function () {
    this.dom.removeEventListener('mousemove', this._onMove);
    this.dom.removeEventListener('mouseleave', this._onLeave);
    if (this._ro) { this._ro.disconnect(); }
    if (this._fallbackResize) { global.removeEventListener('resize', this._fallbackResize); }
    if (this.canvas.parentNode) { this.canvas.parentNode.removeChild(this.canvas); }
    if (this.tip.parentNode) { this.tip.parentNode.removeChild(this.tip); }
  };

  /* ------------------------------------------------------------ 主渲染 */
  LiteChart.prototype.render = function () {
    var opt = this.option;
    var dom = this.dom;
    if (!opt) { return; }
    var w = dom.clientWidth, h = dom.clientHeight;
    if (!w || !h) { return; }

    var dpr = Math.max(1, Math.min(2.5, global.devicePixelRatio || 1));
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    var ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px ' + FONT;

    var grid = opt.grid || {};
    var pad = {
      left: grid.left === undefined ? 52 : grid.left,
      right: grid.right === undefined ? 14 : grid.right,
      top: grid.top === undefined ? 14 : grid.top,
      bottom: grid.bottom === undefined ? 24 : grid.bottom
    };
    var plot = { x: pad.left, y: pad.top, w: w - pad.left - pad.right, h: h - pad.top - pad.bottom };
    if (plot.w <= 10 || plot.h <= 10) { return; }

    var xAxis = Array.isArray(opt.xAxis) ? opt.xAxis[0] : (opt.xAxis || { type: 'category' });
    var yAxis = Array.isArray(opt.yAxis) ? opt.yAxis[0] : (opt.yAxis || { type: 'value' });
    var series = (opt.series || []).filter(function (s) { return s && s.type !== 'pie'; });

    var sx = this._scaleX(xAxis, plot);
    var sy = this._scaleY(yAxis, plot);

    this.hits = [];
    this._acc = {};
    /* 图表级 tooltip 作为兜底：screen.js 只写全局 tooltip 时，各系列也能挂上提示 */
    this.defaultTip = opt.tooltip || null;
    this._drawAxisX(ctx, xAxis, plot, sx);
    this._drawAxisY(ctx, yAxis, plot, sy);

    var i;
    for (i = 0; i < series.length; i++) {
      this._drawSeries(ctx, series[i], plot, sx, sy, xAxis, yAxis);
    }
    for (i = 0; i < series.length; i++) {
      if (series[i].markLine) { this._drawMarkLine(ctx, series[i], plot, sx, sy, xAxis, yAxis); }
    }
  };

  /* ------------------------------------------------------------ 坐标映射 */
  LiteChart.prototype._catInfo = function (axis, plot, horizontal) {
    var data = axis.data || [];
    var n = data.length || 1;
    var boundaryGap = axis.boundaryGap !== false;
    var len = horizontal ? plot.w : plot.h;
    return {
      n: n, data: data, boundaryGap: boundaryGap,
      band: len / n,
      step: n > 1 ? len / (n - 1) : 0,
      origin: horizontal ? plot.x : plot.y,
      len: len
    };
  };

  LiteChart.prototype._scaleX = function (axis, plot) {
    var self = this;
    if (axis.type === 'value') {
      var r = this._valueRange(axis, 'x');
      return {
        type: 'value', min: r.min, max: r.max,
        pos: function (v) { return plot.x + (v - r.min) / (r.max - r.min) * plot.w; },
        invert: function (px) { return r.min + (px - plot.x) / plot.w * (r.max - r.min); }
      };
    }
    var c = this._catInfo(axis, plot, true);
    return {
      type: 'category', cat: c,
      pos: function (i) {
        if (c.boundaryGap) { return plot.x + (i + 0.5) * c.band; }
        return plot.x + (c.n > 1 ? i * c.step : plot.w / 2);
      }
    };
  };

  LiteChart.prototype._scaleY = function (axis, plot) {
    /* 类目轴：heatmap 用得上。inverse:true 让第 0 个类目显示在最上面，
       和真 ECharts 的 yAxis.inverse 行为一致 */
    if (axis.type === 'category') {
      var c = this._catInfo(axis, plot, false);
      var inv = !!axis.inverse;
      return {
        type: 'category', cat: c,
        pos: function (i) {
          /* 和 ECharts 对齐：类目轴默认第 0 个在最下面；inverse:true 时第 0 个跑到最上面 */
          var idx = inv ? i : (c.n - 1 - i);
          return plot.y + (idx + 0.5) * c.band;
        }
      };
    }
    var r = this._valueRange(axis, 'y');
    return {
      min: r.min, max: r.max,
      pos: function (v) { return plot.y + plot.h - (v - r.min) / (r.max - r.min) * plot.h; },
      invert: function (py) { return r.min + (plot.y + plot.h - py) / plot.h * (r.max - r.min); }
    };
  };

  LiteChart.prototype._valueRange = function (axis, dir) {
    if (axis.min !== undefined && axis.max !== undefined) {
      return { min: axis.min, max: axis.max };
    }
    var min = Infinity, max = -Infinity;
    var self = this;
    (this.option.series || []).forEach(function (s) {
      var data = s.data || [];
      data.forEach(function (d) {
        var v = null;
        if (Array.isArray(d)) { v = d[dir === 'x' ? 0 : 1]; }
        else if (d && typeof d === 'object' && Array.isArray(d.value)) { v = d.value[dir === 'x' ? 0 : 1]; }
        else if (typeof d === 'number') { v = dir === 'x' ? null : d; }
        if (v !== null && v !== undefined && isFinite(v)) {
          if (v < min) { min = v; }
          if (v > max) { max = v; }
        }
        if (s.type === 'boxplot' && Array.isArray(d)) {
          d.forEach(function (k) { if (k < min) { min = k; } if (k > max) { max = k; } });
        }
      });
    });
    if (min === Infinity) { min = 0; max = 1; }
    if (min === max) { max = min + 1; }
    return { min: axis.min === undefined ? min : axis.min, max: axis.max === undefined ? max : axis.max };
  };

  /* ------------------------------------------------------------ 坐标轴 */
  LiteChart.prototype._drawAxisY = function (ctx, axis, plot, sy) {
    var label = axis.axisLabel || {};

    /* 类目轴：按类目中心画标签，不画横向分隔线（热力图的格子本身就是分隔） */
    if (axis.type === 'category') {
      var cats = axis.data || [];
      ctx.save();
      ctx.fillStyle = label.color || '#7d92b3';
      ctx.font = (label.fontSize || 10.5) + 'px ' + FONT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var ci = 0; ci < cats.length; ci++) {
        var cy = sy.pos(ci);
        if (cy < plot.y - 1 || cy > plot.y + plot.h + 1) { continue; }
        var ctext = '';
        if (typeof label.formatter === 'function') { ctext = label.formatter(cats[ci], ci); }
        else { ctext = cats[ci]; }
        if (ctext === '' || ctext === null || ctext === undefined) { continue; }
        ctx.fillText(stripRich(ctext), plot.x - 8, cy);
      }
      ctx.restore();
      return;
    }

    var ticks, step;
    if (axis.interval) {
      step = axis.interval;
      ticks = [];
      for (var v = sy.min; v <= sy.max + step * 1e-6; v += step) { ticks.push(Math.round(v * 1e6) / 1e6); }
    } else {
      var t = niceTicks(sy.min, sy.max, axis.splitNumber || 5);
      ticks = t.ticks; step = t.step;
    }
    var label2 = axis.axisLabel || {};
    ctx.save();
    ctx.strokeStyle = 'rgba(86,124,178,0.16)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ticks.forEach(function (tv) {
      var y = Math.round(sy.pos(tv)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    ctx.restore();

    ctx.fillStyle = label2.color || '#7d92b3';
    ctx.font = (label.fontSize || 10.5) + 'px ' + FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    var self = this;
    ticks.forEach(function (tv) {
      var y = sy.pos(tv);
      if (y < plot.y - 1 || y > plot.y + plot.h + 1) { return; }
      var text = '';
      if (typeof label.formatter === 'function') {
        text = label.formatter(tv);
      } else if (typeof label.formatter === 'string') {
        text = label.formatter.replace('{value}', fmtNumber(tv));
      } else {
        text = fmtNumber(tv);
      }
      if (text === '' || text === null || text === undefined) { return; }
      ctx.fillText(text, plot.x - 8, y);
    });

    if (axis.name) {
      ctx.save();
      ctx.translate(11, plot.y + plot.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#5f7395';
      ctx.font = '10.5px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(axis.name, 0, 0);
      ctx.restore();
    }
  };

  LiteChart.prototype._drawAxisX = function (ctx, axis, plot, sx) {
    var label = axis.axisLabel || {};
    var lineY = Math.round(plot.y + plot.h) + 0.5;
    ctx.strokeStyle = 'rgba(86,124,178,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, lineY);
    ctx.lineTo(plot.x + plot.w, lineY);
    ctx.stroke();

    ctx.fillStyle = label.color || '#7d92b3';
    ctx.font = (label.fontSize || 10.5) + 'px ' + FONT;

    if (sx.type === 'category') {
      var data = sx.cat.data;
      var every = 1;
      if (typeof label.interval === 'number') { every = label.interval + 1; }
      for (var i = 0; i < data.length; i++) {
        var show = true;
        if (typeof label.interval === 'function') { show = label.interval(i, data[i]); }
        else if (every > 1) { show = i % every === 0; }
        if (!show) { continue; }
        var text = '';
        if (typeof label.formatter === 'function') { text = label.formatter(data[i], i); }
        else if (typeof label.formatter === 'string') { text = label.formatter.replace('{value}', data[i]); }
        else { text = data[i]; }
        if (text === '' || text === null || text === undefined) { continue; }
        text = stripRich(text);
        var x = sx.pos(i);
        var y = lineY + 9;
        var rot = (label.rotate || 0) * Math.PI / 180;
        ctx.save();
        ctx.translate(x, y);
        if (rot) {
          ctx.rotate(-rot);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
        }
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
      return;
    }

    // value 轴
    var ticks, step;
    if (axis.interval) {
      step = axis.interval;
      ticks = [];
      for (var v = sx.min; v <= sx.max + step * 1e-6; v += step) { ticks.push(Math.round(v * 1e6) / 1e6); }
    } else {
      var t = niceTicks(sx.min, sx.max, axis.splitNumber || 6);
      ticks = t.ticks;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ticks.forEach(function (tv) {
      var text = typeof label.formatter === 'function' ? label.formatter(tv) : fmtNumber(tv);
      if (!text) { return; }
      ctx.fillText(text, sx.pos(tv), lineY + 7);
      ctx.strokeStyle = 'rgba(86,124,178,0.32)';
      ctx.beginPath();
      ctx.moveTo(Math.round(sx.pos(tv)) + 0.5, lineY);
      ctx.lineTo(Math.round(sx.pos(tv)) + 0.5, lineY + 3);
      ctx.stroke();
    });
  };

  /* ------------------------------------------------------------ 各类 series */
  LiteChart.prototype._drawSeries = function (ctx, s, plot, sx, sy, xAxis, yAxis) {
    if (s.type === 'boxplot') { this._boxplot(ctx, s, plot, sx, sy); }
    else if (s.type === 'line') { this._line(ctx, s, plot, sx, sy, xAxis); }
    else if (s.type === 'scatter') { this._scatter(ctx, s, plot, sx, sy); }
    else if (s.type === 'heatmap') { this._heatmap(ctx, s, plot, sx, sy, xAxis, yAxis); }
  };

  /* 热力图：x/y 都是类目轴，每个 data 项 = { value:[xIdx, yIdx, v], txt, itemStyle, label }
     screen.js 已经把颜色和显示文本算好放在 data 项上，这里只负责画矩形 + 写字 + 挂提示。 */
  LiteChart.prototype._heatmap = function (ctx, s, plot, sx, sy, xAxis, yAxis) {
    var nx = (xAxis.data || []).length || 1;
    var ny = (yAxis.data || []).length || 1;
    var cw = plot.w / nx;
    var ch = plot.h / ny;
    var gap = 3;
    var tip = s.tooltip || this.defaultTip;
    var labelCfg = s.label || {};

    for (var i = 0; i < s.data.length; i++) {
      var d = s.data[i];
      if (!d || !Array.isArray(d.value)) { continue; }

      var xi = d.value[0], yi = d.value[1];
      var cx = sx.pos(xi), cy = sy.pos(yi);
      var x0 = cx - cw / 2 + gap / 2, y0 = cy - ch / 2 + gap / 2;
      var w0 = cw - gap, h0 = ch - gap;

      ctx.fillStyle = (d.itemStyle && d.itemStyle.color) || 'rgba(56,88,138,0.12)';
      ctx.fillRect(x0, y0, w0, h0);

      var txt = d.txt !== undefined ? d.txt
        : (typeof d.value[2] === 'number' ? d.value[2].toFixed(1) : '');
      if (txt && labelCfg.show !== false) {
        ctx.fillStyle = (d.label && d.label.color) || labelCfg.color || '#e8f2ff';
        ctx.font = (labelCfg.fontWeight || 600) + ' ' + (labelCfg.fontSize || 12.5) + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, cx, cy + 0.5);
      }

      if (tip && tip.formatter) {
        this.hits.push({
          x: cx, y: cy,
          r: Math.max(8, Math.min(cw, ch) * 0.5),
          html: tip.formatter({ seriesType: 'heatmap', dataIndex: i, data: d, value: d.value })
        });
      }
    }
  };

  LiteChart.prototype._xy = function (d, i, sx, sy, xAxis) {
    if (Array.isArray(d)) {
      if (xAxis.type === 'value') { return { x: sx.pos(d[0]), y: sy.pos(d[1]) }; }
      return { x: sx.pos(i), y: sy.pos(d[1] === undefined ? d[0] : d[1]) };
    }
    if (d && typeof d === 'object' && Array.isArray(d.value)) {
      if (xAxis.type === 'value') { return { x: sx.pos(d.value[0]), y: sy.pos(d.value[1]) }; }
      return { x: sx.pos(i), y: sy.pos(d.value[0]) };
    }
    if (d && typeof d === 'object' && typeof d.value === 'number') {
      return { x: sx.pos(i), y: sy.pos(d.value) };
    }
    return { x: sx.pos(i), y: sy.pos(d) };
  };

  LiteChart.prototype._scatter = function (ctx, s, plot, sx, sy) {
    var baseSize = 4;
    var color = (s.itemStyle && s.itemStyle.color) || '#38e1ff';
    var op = (s.itemStyle && s.itemStyle.opacity) !== undefined ? s.itemStyle.opacity : 0.75;
    var tip = s.tooltip || this.defaultTip;
    for (var i = 0; i < s.data.length; i++) {
      var d = s.data[i];
      var p = this._xy(d, i, sx, sy, { type: 'value' });
      if (p.x < plot.x - 6 || p.x > plot.x + plot.w + 6 || p.y < plot.y - 6 || p.y > plot.y + plot.h + 6) { continue; }
      var size = baseSize;
      var c = color;
      if (d && typeof d === 'object') {
        if (typeof d.symbolSize === 'number') { size = d.symbolSize; }
        if (d.itemStyle && d.itemStyle.color) { c = d.itemStyle.color; }
      }
      ctx.globalAlpha = op;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (tip && tip.formatter && size >= 3) {
        this.hits.push({
          x: p.x, y: p.y,
          html: tip.formatter({ seriesType: 'scatter', dataIndex: i, data: d, value: d && d.value })
        });
      }
    }
  };

  LiteChart.prototype._boxplot = function (ctx, s, plot, sx, sy) {
    var style = s.itemStyle || {};
    var fill = makePaint(ctx, style.color || 'rgba(77,141,255,0.35)', plot);
    var border = style.borderColor || '#4d8dff';
    var bw = Math.min(26, sx.cat.band * 0.52);
    for (var i = 0; i < s.data.length; i++) {
      var d = s.data[i];
      if (!Array.isArray(d) || d.length < 5) { continue; }
      var cx = sx.pos(i);
      var yTop = sy.pos(d[4]), yBot = sy.pos(d[0]);
      var yQ3 = sy.pos(d[3]), yQ1 = sy.pos(d[1]), yMed = sy.pos(d[2]);

      ctx.strokeStyle = border;
      ctx.lineWidth = 1.2;
      // 须
      ctx.beginPath();
      ctx.moveTo(cx, yTop); ctx.lineTo(cx, yQ3);
      ctx.moveTo(cx, yQ1); ctx.lineTo(cx, yBot);
      ctx.stroke();
      // 须帽
      ctx.beginPath();
      ctx.moveTo(cx - bw / 4, yTop); ctx.lineTo(cx + bw / 4, yTop);
      ctx.moveTo(cx - bw / 4, yBot); ctx.lineTo(cx + bw / 4, yBot);
      ctx.stroke();
      // 箱体
      ctx.fillStyle = fill;
      ctx.fillRect(cx - bw / 2, yQ3, bw, Math.max(1, yQ1 - yQ3));
      ctx.strokeRect(cx - bw / 2, yQ3, bw, Math.max(1, yQ1 - yQ3));
      // 中位数
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2, yMed); ctx.lineTo(cx + bw / 2, yMed);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      if (s.tooltip || this.defaultTip) {
        var tipB = s.tooltip || this.defaultTip;
        if (tipB.formatter) {
          this.hits.push({
            x: cx, y: yMed,
            html: tipB.formatter({
              seriesType: 'boxplot',
              dataIndex: i,
              name: (sx.cat.data || [])[i],
              data: d, value: d
            }),
            axis: true
          });
        }
      }
    }
  };

  LiteChart.prototype._line = function (ctx, s, plot, sx, sy, xAxis) {
    var st = s.lineStyle || {};
    var color = st.color || '#38e1ff';
    var width = st.width === undefined ? 2 : st.width;
    var pts = [];
    for (var i = 0; i < s.data.length; i++) {
      var p = this._xy(s.data[i], i, sx, sy, xAxis);
      p.v = Array.isArray(s.data[i]) ? s.data[i][1]
        : (s.data[i] && s.data[i].value ? s.data[i].value[1] : s.data[i]);
      pts.push(p);
    }
    // 堆叠支持（响度 P10–P90 阴影带）
    var lows = null;
    if (s.stack) {
      var key = 'stack_' + (xAxis.type === 'value' ? 'v' : 'c') + '_' + s.stack;
      var acc = this._acc || (this._acc = {});
      var prev = acc[key] || [];
      lows = [];
      pts = pts.map(function (p, idx) {
        var base = prev[idx] || 0;
        lows.push(base);
        var top = p.v;
        return { x: p.x, y: sy.pos(top), v: top, base: base };
      });
      acc[key] = pts.map(function (p) { return p.v; });
    }

    if (s.areaStyle && pts.length) {
      var org = 0;
      var origin = s.areaStyle.origin;
      if (typeof origin === 'number') { org = sy.pos(origin); }
      else if (origin === 'start') { org = sy.pos(sy.min); }
      else { org = sy.pos(sy.min); }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, org);
      pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
      if (lows) {
        for (var j = pts.length - 1; j >= 0; j--) {
          ctx.lineTo(pts[j].x, sy.pos(lows[j]));
        }
      } else {
        for (var k = pts.length - 1; k >= 0; k--) { ctx.lineTo(pts[k].x, org); }
      }
      ctx.closePath();
      ctx.globalAlpha = s.areaStyle.opacity === undefined ? 1 : s.areaStyle.opacity;
      ctx.fillStyle = makePaint(ctx, s.areaStyle.color || rgba(color, 0.2), plot);
      ctx.fill();
      ctx.restore();
    }

    if (width > 0) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      if (st.type === 'dashed') { ctx.setLineDash([4, 4]); }
      else if (st.type === 'dotted') { ctx.setLineDash([1, 3]); }
      if (s.smooth) {
        this._smoothPath(ctx, pts);
      } else {
        ctx.beginPath();
        pts.forEach(function (p, idx) { idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
      }
      ctx.stroke();
      ctx.restore();
    }

    if (s.symbol && s.symbol !== 'none') {
      var size = s.symbolSize || 5;
      ctx.fillStyle = color;
      pts.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    var tipL = s.tooltip || this.defaultTip;
    if (tipL && tipL.formatter && pts.length) {
      var self = this;
      var names = xAxis.type === 'category' ? (xAxis.data || []) : null;
      pts.forEach(function (p, idx) {
        self.hits.push({
          x: p.x, y: p.y, axis: true,
          html: tipL.formatter({
            dataIndex: idx,
            seriesType: 'line',
            seriesName: s.name || '',
            value: p.v,
            name: names ? names[idx] : ''
          })
        });
      });
    }
  };

  LiteChart.prototype._smoothPath = function (ctx, pts) {
    if (pts.length < 3) {
      ctx.beginPath();
      pts.forEach(function (p, i) { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i], p1 = pts[i + 1];
      var mx = (p0.x + p1.x) / 2;
      ctx.bezierCurveTo(mx, p0.y, mx, p1.y, p1.x, p1.y);
    }
  };

  LiteChart.prototype._drawMarkLine = function (ctx, s, plot, sx, sy, xAxis, yAxis) {
    var data = (s.markLine && s.markLine.data) || [];
    var style = (s.markLine && s.markLine.lineStyle) || {};
    for (var i = 0; i < data.length; i++) {
      var m = data[i];
      ctx.save();
      ctx.strokeStyle = style.color || 'rgba(251,191,36,0.85)';
      ctx.lineWidth = style.width || 1.2;
      ctx.setLineDash([5, 4]);
      var lx = null, ly = null;
      if (m.xAxis !== undefined) {
        lx = sx.type === 'value' ? sx.pos(m.xAxis) : sx.pos(xAxis.data.indexOf(m.xAxis));
        ctx.beginPath();
        ctx.moveTo(lx, plot.y);
        ctx.lineTo(lx, plot.y + plot.h);
        ctx.stroke();
      }
      if (m.yAxis !== undefined) {
        ly = sy.pos(m.yAxis);
        ctx.beginPath();
        ctx.moveTo(plot.x, ly);
        ctx.lineTo(plot.x + plot.w, ly);
        ctx.stroke();
      }
      ctx.restore();
      var label = '';
      if (m.label) {
        if (typeof m.label.formatter === 'function') { label = m.label.formatter() || ''; }
        else if (typeof m.label.formatter === 'string') { label = m.label.formatter; }
        else { label = m.label.text || ''; }
      }
      if (label) {
        ctx.fillStyle = style.color || 'rgba(251,191,36,0.95)';
        ctx.font = '10px ' + FONT;
        if (lx !== null) {
          ctx.textAlign = lx > plot.x + plot.w - 60 ? 'right' : 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(label, lx + (ctx.textAlign === 'right' ? -5 : 5), plot.y + 2);
        } else if (ly !== null) {
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, plot.x + plot.w - 4, ly - 3);
        }
      }
    }
  };

  /* ------------------------------------------------------------ 悬浮提示 */
  LiteChart.prototype._hover = function (e) {
    if (!this.hits.length) { return; }
    var rect = this.dom.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var best = null, bestD = Infinity;
    for (var i = 0; i < this.hits.length; i++) {
      var h = this.hits[i];
      var dx = h.x - mx, dy = h.y - my;
      var d = h.axis ? dx * dx : dx * dx + dy * dy;
      /* h.r：按格子半径判定（热力图用），没写就退回默认 16px */
      var lim = h.r ? h.r * h.r : 256;
      if (d < lim && d < bestD) { bestD = d; best = h; }
    }
    if (!best) { this.tip.style.opacity = 0; return; }
    this.tip.innerHTML = best.html;
    this.tip.style.left = best.x + 'px';
    this.tip.style.top = best.y + 'px';
    this.tip.style.opacity = 1;
  };

  global.echarts = {
    init: function (dom) { return new LiteChart(dom); },
    version: 'lite-fallback',
    graphic: {}
  };
  global.__ECHARTS_LITE__ = true;
})(window);
