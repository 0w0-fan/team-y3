/* ============================================================================
 * Spotify 歌手 / 专辑「产量 - 热度」效率分析大屏 · v2 前端逻辑
 * 纯原生 JS + ECharts（本地文件，无 CDN，断网可用）
 * 数据全部来自后端 /api/*，后端读 MySQL 的 artist_track_view（28,356 行）
 * 主题：青蓝（沿用 v1 配色）
 * ========================================================================== */
(function () {
    'use strict';

    /* ==================================================================
     * 0. 舞台等比缩放（1920×1080 定稿）
     * ================================================================== */
    var DESIGN_W = 1920;
    var DESIGN_H = 1080;
    var stage = document.getElementById('stage');

    function fitStage() {
        var scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
        stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
    }

    var NATIVE_SHOT = location.search.indexOf('native=1') >= 0;
    if (NATIVE_SHOT) {
        document.documentElement.classList.add('native-shot');
    } else {
        window.addEventListener('resize', fitStage);
        fitStage();
    }

    /* ==================================================================
     * 1. 主题与通用工具
     * ================================================================== */
    var C = {
        accent: '#22D3EE',
        accentDim: 'rgba(34,211,238,0.55)',
        blue: '#3A7BD5',
        green: '#34D399',
        purple: '#A78BFA',
        warm: '#FBBF24',
        pink: '#F472B6',
        danger: '#F87171',
        textTitle: '#EAF6FF',
        textSub: '#7C8DA6',
        grid: 'rgba(148,163,184,0.12)',
        axis: 'rgba(148,163,184,0.30)'
    };

    /* 系列色板：同屏不超过 6 种（大屏技能规范） */
    var SERIES = [C.accent, C.blue, C.green, C.purple, C.warm, C.pink];

    var AXIS_TEXT = { color: C.textSub, fontSize: 11 };
    var SPLIT = { lineStyle: { color: C.grid } };

    function tip() {
        return {
            backgroundColor: 'rgba(8,17,30,0.94)',
            borderColor: 'rgba(34,211,238,0.35)',
            borderWidth: 1,
            padding: [8, 10],
            textStyle: { color: '#DCE7F5', fontSize: 12 },
            extraCssText: 'box-shadow:0 6px 24px rgba(0,0,0,.45);border-radius:3px;'
        };
    }

    function grad(x1, y1, x2, y2, from, to) {
        return new echarts.graphic.LinearGradient(x1, y1, x2, y2, [
            { offset: 0, color: from },
            { offset: 1, color: to }
        ]);
    }

    function num(n) {
        if (n === null || n === undefined || isNaN(n)) {
            return '--';
        }
        return Number(n).toLocaleString('en-US');
    }

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* 定时器统一登记，标签页隐藏时暂停（大屏要 7×24 小时跑） */
    function every(ms, fn) {
        return setInterval(function () {
            if (document.hidden) {
                return;
            }
            fn();
        }, ms);
    }

    var toastTimer = null;
    function toast(message, isError) {
        var el = document.getElementById('toast');
        el.textContent = message;
        el.className = isError ? 'show error' : 'show';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            el.className = '';
        }, 2200);
    }

    function getJSON(url, options) {
        return fetch(url, options).then(function (res) {
            return res.text().then(function (text) {
                var data = null;
                if (text) {
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        data = text;
                    }
                }
                if (!res.ok) {
                    throw new Error((data && data.message) || ('HTTP ' + res.status));
                }
                return data;
            });
        });
    }

    function postJSON(url, body, method) {
        return getJSON(url, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(body || {})
        });
    }

    /* KPI 数字 0 → 目标值滚动（技能规范：1.2s easeOut） */
    function countUp(el, target, decimals) {
        var duration = 1200;
        var t0 = performance.now();
        var d = decimals || 0;

        function frame(now) {
            var p = Math.min((now - t0) / duration, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            var v = target * eased;
            el.textContent = d > 0 ? v.toFixed(d) : num(Math.round(v));
            if (p < 1) {
                requestAnimationFrame(frame);
            } else {
                el.textContent = d > 0 ? Number(target).toFixed(d) : num(target);
            }
        }
        requestAnimationFrame(frame);
    }

    /* ==================================================================
     * 2. 实时时钟
     * ================================================================== */
    function pad(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    function tickClock() {
        var d = new Date();
        document.getElementById('clock').textContent =
            d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
            pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    /* ==================================================================
     * 3. 图 1：逐年歌曲数 × 平均热度（双轴 + 窗口自动巡航）
     * ================================================================== */
    function renderTrend(d) {
        var chart = echarts.init(document.getElementById('chart-trend'));
        var years = d.points.map(function (p) { return p.year; });
        var songs = d.points.map(function (p) { return p.songs; });
        var pops = d.points.map(function (p) { return p.avgPop; });

        var WIN = 24;
        var start = 0;

        chart.setOption({
            grid: { left: 54, right: 48, top: 30, bottom: 26 },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(34,211,238,0.06)' } },
                formatter: function (ps) {
                    var i = ps[0].dataIndex;
                    return '<b>' + years[i] + ' 年</b><br/>歌曲数 <b style="color:' + C.accent + '">' +
                        num(songs[i]) + '</b> 首<br/>平均热度 <b style="color:' + C.warm + '">' +
                        pops[i].toFixed(2) + '</b>';
                }
            }, tip()),
            legend: {
                right: 6,
                top: 0,
                itemWidth: 12,
                itemHeight: 8,
                textStyle: { color: C.textSub, fontSize: 10 }
            },
            xAxis: {
                type: 'category',
                data: years,
                axisLine: { lineStyle: { color: C.axis } },
                axisTick: { show: false },
                axisLabel: AXIS_TEXT
            },
            yAxis: [
                {
                    type: 'value',
                    name: '歌曲数（首）',
                    nameTextStyle: { color: C.textSub, fontSize: 10 },
                    splitLine: SPLIT,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: Object.assign({}, AXIS_TEXT, {
                        formatter: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; }
                    })
                },
                {
                    type: 'value',
                    name: '热度',
                    min: 0,
                    max: 100,
                    nameTextStyle: { color: C.textSub, fontSize: 10 },
                    splitLine: { show: false },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: AXIS_TEXT
                }
            ],
            dataZoom: [{ type: 'inside', xAxisIndex: 0, startValue: years[0], endValue: years[WIN - 1], zoomLock: true }],
            series: [
                {
                    name: '歌曲数',
                    type: 'bar',
                    barWidth: '56%',
                    itemStyle: {
                        borderRadius: [2, 2, 0, 0],
                        color: grad(0, 1, 0, 0, 'rgba(34,211,238,0.10)', 'rgba(34,211,238,0.92)')
                    },
                    data: songs
                },
                {
                    name: '平均热度',
                    type: 'line',
                    yAxisIndex: 1,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2.5, color: C.warm, shadowColor: 'rgba(251,191,36,0.65)', shadowBlur: 12 },
                    areaStyle: { color: grad(0, 0, 0, 1, 'rgba(251,191,36,0.28)', 'rgba(251,191,36,0.02)') },
                    data: pops
                }
            ]
        });

        // 窗口自动巡航（动效；标签页隐藏时自动暂停）
        every(1500, function () {
            var maxStart = Math.max(1, years.length - WIN);
            start = (start + 1) % maxStart;
            chart.setOption({
                dataZoom: [{
                    startValue: years[start],
                    endValue: years[Math.min(start + WIN - 1, years.length - 1)]
                }]
            });
        });

        document.getElementById('trend-sub').innerHTML =
            d.years + ' 年 · 峰值 <b>' + d.peakYear + '</b>（' + num(d.peakSongs) + ' 首）';
    }

    /* ==================================================================
     * 4. 图 2：歌手作品数长尾分布（对数轴）
     * ================================================================== */
    function renderDistribution(data) {
        var chart = echarts.init(document.getElementById('chart-dist'));
        var bins = data.map(function (d) { return d.bin; });
        var vals = data.map(function (d) { return d.artists; });

        chart.setOption({
            grid: { left: 48, right: 20, top: 26, bottom: 26 },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(34,211,238,0.06)' } },
                formatter: function (p) {
                    return '作品数 <b>' + p[0].name + '</b> 首<br/>歌手数 <b style="color:' + C.accent + '">' +
                        num(p[0].value) + '</b> 位';
                }
            }, tip()),
            xAxis: {
                type: 'category',
                data: bins,
                axisLine: { lineStyle: { color: C.axis } },
                axisTick: { show: false },
                axisLabel: AXIS_TEXT
            },
            yAxis: {
                type: 'log',
                min: 100,
                max: 10000,
                splitLine: SPLIT,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, {
                    formatter: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; }
                })
            },
            series: [{
                type: 'bar',
                barWidth: '46%',
                data: vals.map(function (v, i) {
                    var tail = i === vals.length - 1;
                    return {
                        value: v,
                        itemStyle: {
                            borderRadius: [2, 2, 0, 0],
                            color: tail
                                ? grad(0, 1, 0, 0, 'rgba(251,191,36,0.15)', 'rgba(251,191,36,0.95)')
                                : grad(0, 1, 0, 0, 'rgba(34,211,238,0.10)', 'rgba(34,211,238,0.9)')
                        }
                    };
                }),
                label: {
                    show: true,
                    position: 'top',
                    fontSize: 10,
                    fontFamily: 'Consolas, monospace',
                    color: '#9FB3C8',
                    formatter: function (p) { return num(p.value); }
                }
            }]
        });
    }

    /* ==================================================================
     * 5. 图 3：平均热度 TOP20（轮播高亮）
     * ================================================================== */
    function renderTop(rows) {
        var chart = echarts.init(document.getElementById('chart-top'));
        var rev = rows.slice().reverse();
        var names = rev.map(function (r) { return r.name; });
        var vals = rev.map(function (r) { return r.avgPop; });

        chart.setOption({
            grid: { left: 106, right: 44, top: 6, bottom: 18 },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(34,211,238,0.06)' } },
                formatter: function (p) {
                    var r = rev[p[0].dataIndex];
                    return '<b>No.' + r.rank + ' ' + esc(r.name) + '</b><br/>平均热度 <b style="color:' +
                        C.warm + '">' + r.avgPop.toFixed(2) + '</b><br/>作品数 ' + r.works + ' 首';
                }
            }, tip()),
            xAxis: {
                type: 'value',
                min: 0,
                max: 100,
                splitLine: SPLIT,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: AXIS_TEXT
            },
            yAxis: {
                type: 'category',
                data: names,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, {
                    fontSize: 10,
                    width: 98,
                    overflow: 'truncate',
                    formatter: function (v) { return v.length > 14 ? v.slice(0, 13) + '…' : v; }
                })
            },
            series: [{
                type: 'bar',
                barWidth: '56%',
                data: vals.map(function (v) {
                    var ratio = Math.max(0, Math.min(1, (v - 40) / 50));
                    return {
                        value: v,
                        itemStyle: {
                            borderRadius: [0, 2, 2, 0],
                            color: grad(0, 0, 1, 0,
                                'rgba(34,211,238,' + (0.28 + ratio * 0.25).toFixed(2) + ')',
                                ratio > 0.7 ? C.warm : C.accent)
                        }
                    };
                }),
                label: {
                    show: true,
                    position: 'right',
                    fontSize: 10,
                    fontFamily: 'Consolas, monospace',
                    color: '#8FA6BF',
                    formatter: function (p) { return p.value.toFixed(1); }
                }
            }]
        });

        // 轮播高亮（技能要求的动效之一）
        var cur = 0;
        every(2400, function () {
            chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
            chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: cur });
            cur = (cur + 1) % vals.length;
        });
    }

    /* ==================================================================
     * 6. 图 4：歌手活跃年份跨度 TOP20
     * ================================================================== */
    function renderSpan(rows) {
        var chart = echarts.init(document.getElementById('chart-span'));
        var names = rows.map(function (r) { return r.name; });

        chart.setOption({
            grid: { left: 112, right: 76, top: 6, bottom: 22 },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(167,139,250,0.07)' } },
                formatter: function (params) {
                    var r = rows[params[0].dataIndex];
                    return '<b>' + esc(r.name) + '</b><br/>活跃年份 ' + r.minYear + ' — ' + r.maxYear +
                        '<br/>跨度 <b style="color:' + C.purple + '">' + r.span + ' 年</b><br/>作品数 ' + r.works + ' 首';
                }
            }, tip()),
            xAxis: {
                type: 'value',
                min: 0,
                max: 92,
                splitLine: SPLIT,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, {
                    formatter: function (v) { return 1940 + v; }
                }),
                name: '年份',
                nameTextStyle: { color: C.textSub, fontSize: 10 }
            },
            yAxis: {
                type: 'category',
                data: names,
                inverse: true,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, {
                    fontSize: 10,
                    width: 104,
                    overflow: 'truncate',
                    formatter: function (v) { return v.length > 15 ? v.slice(0, 14) + '…' : v; }
                })
            },
            series: [
                {
                    name: 'offset',
                    type: 'bar',
                    stack: 'span',
                    silent: true,
                    itemStyle: { color: 'transparent' },
                    emphasis: { disabled: true },
                    data: rows.map(function (r) { return Math.max(r.minYear - 1940, 0); })
                },
                {
                    name: '跨度',
                    type: 'bar',
                    stack: 'span',
                    barWidth: 9,
                    data: rows.map(function (r) {
                        return {
                            value: r.span,
                            itemStyle: {
                                borderRadius: 3,
                                color: grad(1, 0, 0, 0, 'rgba(34,211,238,0.95)', 'rgba(167,139,250,0.85)')
                            }
                        };
                    }),
                    label: {
                        show: true,
                        position: 'right',
                        fontSize: 10,
                        fontFamily: 'Consolas, monospace',
                        color: '#8FA6BF',
                        formatter: function (p) {
                            var r = rows[p.dataIndex];
                            return r.minYear + '–' + r.maxYear + ' (' + r.span + '年)';
                        }
                    }
                }
            ]
        });
    }

    /* ==================================================================
     * 7. 图 5（主视觉）：作品数 × 平均热度 四象限气泡
     *    点大小 = 该歌手专辑数（v2 新维度）
     * ================================================================== */
    function renderQuadrant(d) {
        var chart = echarts.init(document.getElementById('chart-quadrant'));
        var medianX = d.medianWorks;
        var splitY = d.globalAvgPop;

        var groups = { star: [], craft: [], volume: [], tail: [] };
        var maxAlbum = 0;

        d.points.forEach(function (p) {
            if (p.albumCount > maxAlbum) {
                maxAlbum = p.albumCount;
            }
            var many = p.works >= medianX;
            var hot = p.avgPop >= splitY;
            var key = many ? (hot ? 'star' : 'volume') : (hot ? 'craft' : 'tail');
            groups[key].push([p.works, p.avgPop, p.name, p.albumCount]);
        });

        function size(val) {
            var albums = val[3] || 1;
            return 5 + Math.sqrt(albums / Math.max(maxAlbum, 1)) * 26;
        }

        var defs = [
            { key: 'tail', name: '长尾区 · 少且冷', color: 'rgba(148,163,184,0.50)' },
            { key: 'volume', name: '走量区 · 多但冷', color: 'rgba(251,191,36,0.60)' },
            { key: 'craft', name: '精品区 · 少而热', color: 'rgba(167,139,250,0.80)' },
            { key: 'star', name: '明星区 · 多且热', color: C.accent }
        ];

        var series = defs.map(function (def, idx) {
            var s = {
                name: def.name,
                type: 'scatter',
                symbolSize: size,
                itemStyle: {
                    color: def.color,
                    opacity: def.key === 'tail' ? 0.5 : 0.8,
                    borderColor: 'rgba(255,255,255,0.25)',
                    borderWidth: def.key === 'star' ? 0.6 : 0,
                    shadowBlur: def.key === 'star' ? 10 : 0,
                    shadowColor: 'rgba(34,211,238,0.7)'
                },
                emphasis: { itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 1 } },
                data: groups[def.key]
            };
            if (idx === 0) {
                s.markLine = {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { color: C.accentDim, type: 'dashed', width: 1 },
                    label: {
                        color: C.textSub,
                        fontSize: 10,
                        backgroundColor: 'rgba(8,17,30,0.75)',
                        padding: [2, 4]
                    },
                    data: [
                        { xAxis: medianX, label: { formatter: '作品中位 ' + medianX + ' 首', position: 'end' } },
                        { yAxis: splitY, label: { formatter: '热度均值 ' + splitY, position: 'insideEndTop' } }
                    ]
                };
                s.markArea = {
                    silent: true,
                    itemStyle: { opacity: 1 },
                    data: [
                        [
                            { xAxis: 3, yAxis: splitY, itemStyle: { color: 'rgba(167,139,250,0.05)' } },
                            { xAxis: medianX, yAxis: 100 }
                        ],
                        [
                            { xAxis: medianX, yAxis: splitY, itemStyle: { color: 'rgba(34,211,238,0.06)' } },
                            { xAxis: 200, yAxis: 100 }
                        ]
                    ]
                };
            }
            return s;
        });

        chart.setOption({
            grid: { left: 52, right: 22, top: 34, bottom: 40 },
            animationDuration: 1200,
            legend: {
                right: 10,
                top: 2,
                itemWidth: 9,
                itemHeight: 9,
                itemGap: 14,
                textStyle: { color: C.textSub, fontSize: 11 },
                data: defs.map(function (x) { return x.name; })
            },
            tooltip: Object.assign({
                trigger: 'item',
                formatter: function (p) {
                    return '<b>' + esc(p.data[2]) + '</b><br/>作品数 <b style="color:' + C.accent + '">' + p.data[0] +
                        '</b> 首<br/>平均热度 <b style="color:' + C.warm + '">' + p.data[1].toFixed(2) +
                        '</b><br/>专辑数 <b style="color:' + C.purple + '">' + p.data[3] + '</b> 张';
                }
            }, tip()),
            xAxis: {
                type: 'log',
                min: 3,
                max: 200,
                name: '作品数（对数轴）',
                nameLocation: 'middle',
                nameGap: 26,
                nameTextStyle: { color: C.textSub, fontSize: 11 },
                axisLine: { lineStyle: { color: C.axis } },
                axisTick: { show: false },
                axisLabel: AXIS_TEXT,
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: 100,
                name: '平均热度',
                nameTextStyle: { color: C.textSub, fontSize: 11, padding: [0, 0, 0, -14] },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: AXIS_TEXT,
                splitLine: SPLIT
            },
            series: series
        });

        document.getElementById('quadrant-sub').innerHTML =
            '作品数 ≥ 3 · <b>' + num(d.count) + '</b> 位歌手 · 气泡大小 = 专辑数（最大 ' + maxAlbum + ' 张）';
    }

    /* ==================================================================
     * 8. 底部滚动流：最新关注 / 标签
     * ================================================================== */
    var flowY = 0;

    function renderActivity(items) {
        var ul = document.getElementById('flow-list');
        document.getElementById('activity-sub').textContent = '最新 ' + items.length + ' 条';

        if (!items || !items.length) {
            ul.style.transform = 'translateY(0)';
            ul.innerHTML = '<li class="empty-row">还没有动态，去右边「关注歌手」或「歌曲打标签」写一条试试</li>';
            return;
        }

        var rows = items.map(function (it) {
            var isFav = it.type === 'favorite';
            return '<li>' +
                '<span class="lv lv-' + (isFav ? 'favorite' : 'tag') + '">' + (isFav ? '关注' : '标签') + '</span>' +
                '<span class="f-time">' + esc((it.time || '').slice(5, 19)) + '</span>' +
                '<span class="f-title" title="' + esc(it.title) + '">' + esc(it.title) + '</span>' +
                '<span class="f-detail" title="' + esc(it.detail) + '">' + esc(it.detail || '') + '</span>' +
                '</li>';
        }).join('');

        /* 复制一份接在尾部，实现无缝滚动 */
        ul.innerHTML = rows + rows;
        flowY = 0;
        ul.style.transform = 'translateY(0)';
    }

    function loadActivity() {
        return getJSON('/api/activity/recent?limit=20').then(renderActivity);
    }

    every(40, function () {
        var ul = document.getElementById('flow-list');
        var half = ul.scrollHeight / 2;
        if (!half) {
            return;
        }
        flowY = (flowY + 0.8) % half;
        ul.style.transform = 'translateY(-' + flowY.toFixed(1) + 'px)';
    });

    /* ==================================================================
     * 9. 交互件 1：关注歌手
     * ================================================================== */
    var favorites = [];

    function renderFavorites() {
        var box = document.getElementById('fav-list');
        document.getElementById('fav-count').textContent = favorites.length + ' 条';
        document.getElementById('kpi-fav').textContent = favorites.length;

        if (!favorites.length) {
            box.innerHTML = '<div class="empty">还没有关注的歌手，搜一个关注试试</div>';
            return;
        }

        box.innerHTML = favorites.map(function (f) {
            return '<div class="item" data-id="' + f.id + '">' +
                '<span class="name" title="' + esc(f.artistName) + '">' + esc(f.artistName) + '</span>' +
                '<span class="note" data-note="' + esc(f.note || '') + '" title="' + esc(f.note || '') + '">' +
                esc(f.note || '—') + '</span>' +
                '<span class="time">' + esc((f.createdAt || '').slice(5, 16)) + '</span>' +
                '<span class="ops">' +
                '<button class="ghost mini" data-act="edit">备注</button>' +
                '<button class="danger" data-act="del">删除</button>' +
                '</span></div>';
        }).join('');
    }

    function loadFavorites() {
        return getJSON('/api/favorite').then(function (rows) {
            favorites = rows || [];
            renderFavorites();
        });
    }

    function afterWrite() {
        return Promise.all([loadFavorites(), loadActivity(), refreshCounters()]);
    }

    function refreshCounters() {
        return getJSON('/api/overview').then(function (o) {
            document.getElementById('kpi-fav').textContent = o.favorites;
            document.getElementById('kpi-tag').textContent = o.tags;
        }).catch(function () { /* 计数刷新失败不影响写库结果 */ });
    }

    function addFavorite() {
        var nameInput = document.getElementById('fav-name');
        var noteInput = document.getElementById('fav-note');
        var name = nameInput.value.trim();

        if (!name) {
            toast('先填写歌手名', true);
            nameInput.focus();
            return;
        }

        postJSON('/api/favorite', { artistName: name, note: noteInput.value.trim() })
            .then(function () {
                nameInput.value = '';
                noteInput.value = '';
                toast('已关注 ' + name);
                return afterWrite();
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function editFavoriteNote(item) {
        var noteEl = item.querySelector('.note');
        var ops = item.querySelector('.ops');
        var current = noteEl.getAttribute('data-note') || '';

        noteEl.innerHTML = '<input type="text" maxlength="128" value="' + esc(current) +
            '" style="height:22px;font-size:11px;width:100%">';
        ops.innerHTML = '<button class="ghost mini" data-act="save">保存</button>' +
            '<button class="danger" data-act="cancel">取消</button>';

        var input = noteEl.querySelector('input');
        input.focus();
        input.select();
    }

    function saveFavoriteNote(item, id) {
        var input = item.querySelector('.note input');
        var value = input ? input.value.trim() : '';

        postJSON('/api/favorite/' + id, { note: value }, 'PUT')
            .then(function () {
                toast('备注已更新');
                return afterWrite();
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function deleteFavorite(id) {
        getJSON('/api/favorite/' + id, { method: 'DELETE' })
            .then(function () {
                toast('已取消关注');
                return afterWrite();
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function bindFavorites() {
        document.getElementById('fav-add').addEventListener('click', addFavorite);
        document.getElementById('fav-name').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                addFavorite();
            }
        });

        document.getElementById('fav-list').addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-act]');
            if (!btn) {
                return;
            }
            var item = btn.closest('.item');
            var id = item.getAttribute('data-id');
            var act = btn.getAttribute('data-act');

            if (act === 'del') {
                deleteFavorite(id);
            } else if (act === 'edit') {
                editFavoriteNote(item);
            } else if (act === 'save') {
                saveFavoriteNote(item, id);
            } else if (act === 'cancel') {
                loadFavorites();
            }
        });
    }

    /* ==================================================================
     * 10. 交互件 2：歌曲打标签
     * ================================================================== */
    var pickedSong = null;
    var searchTimer = null;

    function highlightPick(trackId) {
        var nodes = document.querySelectorAll('#song-results .pick-item');
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].classList.toggle('active', nodes[i].getAttribute('data-track') === trackId);
        }
    }

    function renderSongResults(rows) {
        var box = document.getElementById('song-results');

        if (!rows || !rows.length) {
            box.innerHTML = '<div class="empty">没有找到匹配的歌曲</div>';
            return;
        }

        box.innerHTML = rows.map(function (s, i) {
            return '<div class="pick-item" data-track="' + esc(s.trackId) + '" data-name="' + esc(s.trackName) +
                '" data-artist="' + esc(s.artist) + '">' +
                '<span class="rk">' + (i + 1) + '</span>' +
                '<span class="song" title="' + esc(s.trackName) + '">' + esc(s.trackName) + '</span>' +
                '<span class="artist" title="' + esc(s.artist) + '">' + esc(s.artist) + '</span>' +
                '<span class="pop">' + s.popularity + '</span></div>';
        }).join('');

        if (pickedSong) {
            highlightPick(pickedSong.trackId);
        }
    }

    function searchSongs(keyword) {
        if (!keyword) {
            return;
        }
        getJSON('/api/song/search?q=' + encodeURIComponent(keyword) + '&limit=6')
            .then(renderSongResults)
            .catch(function (e) { toast(e.message, true); });
    }

    function pickSong(el) {
        pickedSong = {
            trackId: el.getAttribute('data-track'),
            trackName: el.getAttribute('data-name'),
            artist: el.getAttribute('data-artist')
        };
        document.getElementById('picked').style.display = 'flex';
        document.getElementById('picked-title').textContent = pickedSong.trackName + ' · ' + pickedSong.artist;
        highlightPick(pickedSong.trackId);
        loadTags();
    }

    function renderTags(rows) {
        var box = document.getElementById('tag-list');
        document.getElementById('tag-count').textContent = rows.length + ' 个标签';

        if (!rows.length) {
            box.innerHTML = '<div class="empty" style="width:100%">这首歌还没有标签</div>';
            return;
        }

        box.innerHTML = rows.map(function (t) {
            return '<span class="tag-chip">' + esc(t.tagName) +
                '<i data-id="' + t.id + '" title="删除">×</i></span>';
        }).join('');
    }

    function loadTags() {
        if (!pickedSong) {
            return Promise.resolve();
        }
        return getJSON('/api/tag?trackId=' + encodeURIComponent(pickedSong.trackId))
            .then(function (rows) { renderTags(rows || []); })
            .catch(function (e) { toast(e.message, true); });
    }

    function addTag() {
        if (!pickedSong) {
            toast('先搜索并选中一首歌', true);
            return;
        }
        var input = document.getElementById('tag-input');
        var tag = input.value.trim();

        if (!tag) {
            toast('标签不能为空', true);
            input.focus();
            return;
        }

        postJSON('/api/tag', { trackId: pickedSong.trackId, tagName: tag })
            .then(function () {
                input.value = '';
                toast('已添加标签「' + tag + '」');
                return Promise.all([loadTags(), loadActivity(), refreshCounters()]);
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function deleteTag(id) {
        getJSON('/api/tag/' + id, { method: 'DELETE' })
            .then(function () {
                toast('标签已删除');
                return Promise.all([loadTags(), loadActivity(), refreshCounters()]);
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function bindTags() {
        var q = document.getElementById('song-q');

        q.addEventListener('input', function () {
            clearTimeout(searchTimer);
            var keyword = q.value.trim();
            if (!keyword) {
                document.getElementById('song-results').innerHTML = '<div class="empty">输入关键词找歌</div>';
                return;
            }
            searchTimer = setTimeout(function () { searchSongs(keyword); }, 320);
        });

        q.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                searchSongs(q.value.trim());
            }
        });

        document.getElementById('song-search').addEventListener('click', function () {
            searchSongs(q.value.trim());
        });

        document.getElementById('song-results').addEventListener('click', function (e) {
            var row = e.target.closest('.pick-item');
            if (row) {
                pickSong(row);
            }
        });

        document.getElementById('tag-add').addEventListener('click', addTag);
        document.getElementById('tag-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                addTag();
            }
        });
        document.getElementById('tag-list').addEventListener('click', function (e) {
            var icon = e.target.closest('i[data-id]');
            if (icon) {
                deleteTag(icon.getAttribute('data-id'));
            }
        });
    }

    /* ==================================================================
     * 11. KPI 翻牌
     * ================================================================== */
    function renderKPI(o) {
        countUp(document.getElementById('kpi-songs'), o.songs);
        countUp(document.getElementById('kpi-artists'), o.artists);
        countUp(document.getElementById('kpi-albums'), o.albums);
        countUp(document.getElementById('kpi-pop'), o.avgPopularity, 2);
        document.getElementById('kpi-fav').textContent = o.favorites;
        document.getElementById('kpi-tag').textContent = o.tags;
    }

    /* ==================================================================
     * 12. 启动
     * ================================================================== */
    function boot() {
        tickClock();
        every(1000, tickClock);

        Promise.all([
            getJSON('/api/overview'),
            getJSON('/api/year/trend'),
            getJSON('/api/artist/distribution'),
            getJSON('/api/artist/top?limit=20'),
            getJSON('/api/artist/span?limit=20'),
            getJSON('/api/artist/quadrant')
        ]).then(function (res) {
            renderKPI(res[0]);
            renderTrend(res[1]);
            renderDistribution(res[2]);
            renderTop(res[3]);
            renderSpan(res[4]);
            renderQuadrant(res[5]);
        }).catch(function (e) {
            toast('数据加载失败：' + e.message, true);
            console.error(e);
        });

        bindFavorites();
        bindTags();

        loadFavorites().catch(function (e) { toast('关注列表加载失败：' + e.message, true); });
        loadActivity().catch(function (e) { toast('动态流加载失败：' + e.message, true); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
