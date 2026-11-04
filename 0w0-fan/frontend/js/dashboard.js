/* ============================================================================
 * Spotify 歌手 / 专辑「产量 - 热度」效率分析大屏 · 前端逻辑
 * 纯原生 JS + ECharts（本地文件，无 CDN，断网可用）
 * 所有数据来自后端 /api/*，后端读 MySQL 的 artist_track_view（28,356 行）
 * ========================================================================== */
(function () {
    'use strict';

    var DESIGN_W = 1920;
    var DESIGN_H = 1080;

    /* ------------------------------------------------------------------
     * 0. 整屏缩放：1920x1080 设计稿等比缩放到任意窗口，永不出现滚动条
     * ------------------------------------------------------------------ */
    var stage = document.getElementById('stage');

    function fitStage() {
        var scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
        stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
    }

    var NATIVE_SHOT = location.search.indexOf('native=1') >= 0;

    if (NATIVE_SHOT) {
        // 截图取证模式：保留 1920x1080 原始像素，允许滚动
        document.documentElement.classList.add('native-shot');
    } else {
        window.addEventListener('resize', fitStage);
        fitStage();
    }

    /* ------------------------------------------------------------------
     * 1. 工具
     * ------------------------------------------------------------------ */
    var COLORS = {
        cyan: '#22D3EE',
        cyanSoft: 'rgba(34,211,238,0.55)',
        purple: '#A78BFA',
        green: '#34D399',
        pink: '#F472B6',
        amber: '#FBBF24',
        slate: '#64748B',
        dimSlate: '#3E4C63',
        text: '#DCE7F5',
        muted: '#7C8DA6'
    };

    var AXIS_TEXT = { color: COLORS.muted, fontSize: 11 };
    var SPLIT_LINE = { lineStyle: { color: 'rgba(148,163,184,0.12)' } };

    function tooltipStyle() {
        return {
            backgroundColor: 'rgba(8,17,30,0.94)',
            borderColor: 'rgba(34,211,238,0.35)',
            borderWidth: 1,
            padding: [8, 10],
            textStyle: { color: COLORS.text, fontSize: 12 },
            extraCssText: 'box-shadow:0 6px 24px rgba(0,0,0,.45);border-radius:3px;'
        };
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
                    var msg = (data && data.message) ? data.message : ('HTTP ' + res.status);
                    throw new Error(msg);
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

    /* KPI 数字滚动 */
    function countUp(el, target, decimals) {
        var start = 0;
        var duration = 900;
        var t0 = performance.now();
        var d = decimals || 0;

        function frame(now) {
            var p = Math.min((now - t0) / duration, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            var v = start + (target - start) * eased;
            el.textContent = d > 0 ? v.toFixed(d) : num(Math.round(v));
            if (p < 1) {
                requestAnimationFrame(frame);
            } else {
                el.textContent = d > 0 ? Number(target).toFixed(d) : num(target);
            }
        }
        requestAnimationFrame(frame);
    }

    /* ------------------------------------------------------------------
     * 2. 图表：作品数长尾分布（log y）
     * ------------------------------------------------------------------ */
    function renderDistribution(data) {
        var chart = echarts.init(document.getElementById('chart-distribution'));
        var bins = [];
        var values = [];

        data.forEach(function (d) {
            bins.push(d.bin);
            values.push(d.artists);
        });

        chart.setOption({
            grid: { left: 46, right: 22, top: 34, bottom: 28 },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(34,211,238,0.06)' } },
                formatter: function (p) {
                    return '作品数 ' + p[0].name + ' 首<br/>歌手数 <b style="color:' + COLORS.cyan + '">' +
                        num(p[0].value) + '</b>';
                }
            }, tooltipStyle()),
            xAxis: {
                type: 'category',
                data: bins,
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, { fontSize: 11 }),
                name: '作品数（首）',
                nameTextStyle: { color: COLORS.muted, fontSize: 10, padding: [0, 0, 0, 6] }
            },
            yAxis: {
                type: 'log',
                min: 100,
                max: 10000,
                splitLine: SPLIT_LINE,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, {
                    formatter: function (v) {
                        return v >= 1000 ? (v / 1000) + 'k' : v;
                    }
                })
            },
            series: [{
                type: 'bar',
                barWidth: '46%',
                data: values.map(function (v, i) {
                    var isTail = i === values.length - 1;
                    return {
                        value: v,
                        itemStyle: {
                            borderRadius: [2, 2, 0, 0],
                            color: new echarts.graphic.LinearGradient(0, 1, 0, 0, isTail ? [
                                { offset: 0, color: 'rgba(251,191,36,0.15)' },
                                { offset: 1, color: 'rgba(251,191,36,0.95)' }
                            ] : [
                                { offset: 0, color: 'rgba(34,211,238,0.12)' },
                                { offset: 1, color: 'rgba(34,211,238,0.9)' }
                            ])
                        }
                    };
                }),
                label: {
                    show: true,
                    position: 'top',
                    color: '#9FB3C8',
                    fontSize: 10,
                    fontFamily: 'Consolas, monospace',
                    formatter: function (p) {
                        return num(p.value);
                    }
                }
            }]
        });
    }

    /* ------------------------------------------------------------------
     * 3. 图表：歌手活跃年份跨度 TOP20
     * ------------------------------------------------------------------ */
    function renderSpan(rows) {
        var chart = echarts.init(document.getElementById('chart-span'));
        var names = rows.map(function (r) { return r.name; });
        var base = rows.map(function (r) { return Math.max(r.minYear - 1940, 0); });

        chart.setOption({
            grid: { left: 128, right: 82, top: 10, bottom: 26 },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(167,139,250,0.07)' } },
                formatter: function (params) {
                    var idx = params[0].dataIndex;
                    var r = rows[idx];
                    return '<b>' + esc(r.name) + '</b><br/>活跃年份 ' + r.minYear + ' — ' + r.maxYear +
                        '<br/>跨度 <b style="color:' + COLORS.purple + '">' + r.span + ' 年</b>' +
                        '<br/>作品数 ' + r.works;
                }
            }, tooltipStyle()),
            xAxis: {
                type: 'value',
                min: 0,
                max: 90,
                splitLine: SPLIT_LINE,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, {
                    formatter: function (v) { return 1940 + v; }
                }),
                name: '年份',
                nameTextStyle: { color: COLORS.muted, fontSize: 10 }
            },
            yAxis: {
                type: 'category',
                data: names,
                inverse: true,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, {
                    fontSize: 10,
                    width: 118,
                    overflow: 'truncate',
                    formatter: function (v) {
                        return v.length > 16 ? v.slice(0, 15) + '…' : v;
                    }
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
                    data: base
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
                                color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
                                    { offset: 0, color: 'rgba(34,211,238,0.95)' },
                                    { offset: 1, color: 'rgba(167,139,250,0.85)' }
                                ])
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
                            return r.minYear + '–' + r.maxYear + '  (' + r.span + '年)';
                        }
                    }
                }
            ]
        });
    }

    /* ------------------------------------------------------------------
     * 4. 图表：四象限散点（主图）
     * ------------------------------------------------------------------ */
    function renderQuadrant(d) {
        var chart = echarts.init(document.getElementById('chart-quadrant'));
        var medianX = d.medianWorks;
        var splitY = d.globalAvgPop;

        var groups = {
            star: [],
            craft: [],
            volume: [],
            tail: []
        };

        d.points.forEach(function (p) {
            var many = p.works >= medianX;
            var hot = p.avgPop >= splitY;
            var key = many ? (hot ? 'star' : 'volume') : (hot ? 'craft' : 'tail');
            groups[key].push([p.works, p.avgPop, p.name]);
        });

        var defs = [
            { key: 'tail', name: '长尾区 · 少且冷', color: 'rgba(148,163,184,0.55)' },
            { key: 'volume', name: '走量区 · 多但冷', color: 'rgba(251,191,36,0.65)' },
            { key: 'craft', name: '精品区 · 少而热', color: 'rgba(167,139,250,0.85)' },
            { key: 'star', name: '明星区 · 多且热', color: COLORS.cyan }
        ];

        var series = defs.map(function (def) {
            return {
                name: def.name,
                type: 'scatter',
                symbolSize: def.key === 'star' ? 7 : 5,
                itemStyle: {
                    color: def.color,
                    opacity: def.key === 'tail' ? 0.55 : 0.85,
                    shadowBlur: def.key === 'star' ? 8 : 0,
                    shadowColor: 'rgba(34,211,238,0.8)'
                },
                emphasis: {
                    itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 1 }
                },
                data: groups[def.key]
            };
        });

        // 分割线 + 象限底色
        series[0].markLine = {
            silent: true,
            symbol: 'none',
            lineStyle: { color: COLORS.cyanSoft, type: 'dashed', width: 1 },
            label: {
                color: '#7C8DA6',
                fontSize: 10,
                backgroundColor: 'rgba(8,17,30,0.7)',
                padding: [2, 4]
            },
            data: [
                {
                    xAxis: medianX,
                    label: { formatter: '作品中位 ' + medianX + ' 首', position: 'end' }
                },
                {
                    yAxis: splitY,
                    label: { formatter: '热度均值 ' + splitY, position: 'insideEndTop' }
                }
            ]
        };

        series[0].markArea = {
            silent: true,
            itemStyle: { opacity: 1 },
            data: [
                [
                    { xAxis: 3, yAxis: splitY, itemStyle: { color: 'rgba(167,139,250,0.045)' } },
                    { xAxis: medianX, yAxis: 100 }
                ],
                [
                    { xAxis: medianX, yAxis: splitY, itemStyle: { color: 'rgba(34,211,238,0.05)' } },
                    { xAxis: 200, yAxis: 100 }
                ]
            ]
        };

        chart.setOption({
            grid: { left: 46, right: 20, top: 30, bottom: 34 },
            legend: {
                right: 12,
                top: 2,
                itemWidth: 8,
                itemHeight: 8,
                itemGap: 12,
                textStyle: { color: COLORS.muted, fontSize: 10 },
                data: defs.map(function (d2) { return d2.name; })
            },
            tooltip: Object.assign({
                trigger: 'item',
                formatter: function (p) {
                    return '<b>' + esc(p.data[2]) + '</b><br/>作品数 <b style="color:' + COLORS.cyan + '">' +
                        p.data[0] + '</b> 首<br/>平均热度 <b style="color:' + COLORS.amber + '">' +
                        p.data[1].toFixed(2) + '</b>';
                }
            }, tooltipStyle()),
            xAxis: {
                type: 'log',
                min: 3,
                max: 200,
                name: '作品数（对数轴）',
                nameLocation: 'middle',
                nameGap: 22,
                nameTextStyle: { color: COLORS.muted, fontSize: 10 },
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, {
                    formatter: function (v) { return v; }
                }),
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: 100,
                name: '平均热度',
                nameTextStyle: { color: COLORS.muted, fontSize: 10, padding: [0, 0, 0, -10] },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: AXIS_TEXT,
                splitLine: SPLIT_LINE
            },
            series: series
        });

        document.getElementById('quadrant-sub').innerHTML =
            '作品数 ≥ 3 · <b>' + num(d.count) + '</b> 位歌手 · 中位数 ' + medianX + ' / 均值 ' + splitY;
    }

    /* ------------------------------------------------------------------
     * 5. 图表：平均热度 TOP20
     * ------------------------------------------------------------------ */
    function renderTop(rows) {
        var chart = echarts.init(document.getElementById('chart-top'));
        var names = rows.map(function (r) { return r.name; }).reverse();
        var vals = rows.map(function (r) { return r.avgPop; }).reverse();
        var ranked = rows.slice().reverse();

        chart.setOption({
            grid: { left: 118, right: 46, top: 8, bottom: 22 },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(34,211,238,0.06)' } },
                formatter: function (p) {
                    var r = ranked[p[0].dataIndex];
                    return '<b>No.' + r.rank + ' ' + esc(r.name) + '</b><br/>平均热度 <b style="color:' +
                        COLORS.amber + '">' + r.avgPop.toFixed(2) + '</b><br/>作品数 ' + r.works + ' 首';
                }
            }, tooltipStyle()),
            xAxis: {
                type: 'value',
                min: 0,
                max: 100,
                splitLine: SPLIT_LINE,
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
                    width: 108,
                    overflow: 'truncate',
                    formatter: function (v) {
                        return v.length > 15 ? v.slice(0, 14) + '…' : v;
                    }
                })
            },
            series: [{
                type: 'bar',
                barWidth: '58%',
                data: vals.map(function (v) {
                    var ratio = Math.max(0, Math.min(1, (v - 40) / 50));
                    return {
                        value: v,
                        itemStyle: {
                            borderRadius: [0, 2, 2, 0],
                            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                                { offset: 0, color: 'rgba(34,211,238,' + (0.25 + ratio * 0.25).toFixed(2) + ')' },
                                { offset: 1, color: ratio > 0.7 ? COLORS.amber : COLORS.cyan }
                            ])
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
    }

    /* ------------------------------------------------------------------
     * 6. 图表：专辑曲目数 × 歌曲平均热度
     * ------------------------------------------------------------------ */
    function renderAlbum(rows) {
        var chart = echarts.init(document.getElementById('chart-album'));
        var bins = rows.map(function (r) { return r.bin + ' 首'; });
        var vals = rows.map(function (r) { return r.avgPop; });
        var albums = rows.map(function (r) { return r.albums; });
        var min = Math.min.apply(null, vals) - 2;
        var max = Math.max.apply(null, vals) + 2;

        chart.setOption({
            grid: { left: 44, right: 16, top: 34, bottom: 30 },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(244,114,182,0.07)' } },
                formatter: function (p) {
                    var i = p[0].dataIndex;
                    return '专辑曲目数 <b>' + rows[i].bin + '</b><br/>专辑数 ' + num(rows[i].albums) +
                        ' 张<br/>歌曲平均热度 <b style="color:' + COLORS.pink + '">' + rows[i].avgPop.toFixed(2) + '</b>';
                }
            }, tooltipStyle()),
            xAxis: {
                type: 'category',
                data: bins,
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, { fontSize: 11 }),
                name: '专辑曲目数',
                nameTextStyle: { color: COLORS.muted, fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                min: Math.floor(min),
                max: Math.ceil(max),
                splitLine: SPLIT_LINE,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, { fontSize: 10 })
            },
            series: [{
                type: 'bar',
                barWidth: '42%',
                data: vals.map(function (v, i) {
                    return {
                        value: v,
                        itemStyle: {
                            borderRadius: [3, 3, 0, 0],
                            color: new echarts.graphic.LinearGradient(0, 1, 0, 0, [
                                { offset: 0, color: 'rgba(244,114,182,0.12)' },
                                { offset: 1, color: i === 0 ? 'rgba(244,114,182,0.9)' : 'rgba(167,139,250,0.75)' }
                            ])
                        }
                    };
                }),
                label: {
                    show: true,
                    position: 'top',
                    fontSize: 10,
                    lineHeight: 13,
                    fontFamily: 'Consolas, monospace',
                    color: '#9FB3C8',
                    formatter: function (p) {
                        return p.value.toFixed(1) + '\n' + num(albums[p.dataIndex]) + '张';
                    }
                }
            }]
        });
    }

    /* ------------------------------------------------------------------
     * 7. 图表：热度 × 时长（28,356 点）
     * ------------------------------------------------------------------ */
    function renderScatter(d) {
        var chart = echarts.init(document.getElementById('chart-scatter'));
        var data = d.points.map(function (p) { return [p.x, p.y]; });

        chart.setOption({
            grid: { left: 44, right: 16, top: 26, bottom: 30 },
            tooltip: Object.assign({
                trigger: 'item',
                formatter: function (p) {
                    return '时长 <b style="color:' + COLORS.cyan + '">' + p.data[0] + '</b> 分<br/>热度 <b style="color:' +
                        COLORS.amber + '">' + p.data[1] + '</b>';
                }
            }, tooltipStyle()),
            xAxis: {
                type: 'value',
                min: 0,
                max: 9,
                name: '时长（分钟）',
                nameTextStyle: { color: COLORS.muted, fontSize: 10 },
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, { fontSize: 10 }),
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: 100,
                name: '热度',
                nameTextStyle: { color: COLORS.muted, fontSize: 10, padding: [0, 0, 0, -12] },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, { fontSize: 10 }),
                splitLine: SPLIT_LINE
            },
            series: [{
                type: 'scatter',
                large: true,
                largeThreshold: 2000,
                progressive: 5000,
                symbolSize: 3,
                itemStyle: { color: 'rgba(34,211,238,0.38)' },
                emphasis: { itemStyle: { color: COLORS.amber } },
                data: data
            }]
        });
    }

    /* ------------------------------------------------------------------
     * 8. 交互件 1：关注歌手
     * ------------------------------------------------------------------ */
    var favorites = [];

    function renderFavorites() {
        var box = document.getElementById('fav-list');
        document.getElementById('fav-count').textContent = favorites.length + ' 条';
        document.getElementById('kpi-fav').textContent = favorites.length;

        if (!favorites.length) {
            box.innerHTML = '<div class="empty">还没有关注的歌手</div>';
            return;
        }

        box.innerHTML = favorites.map(function (f) {
            return '' +
                '<div class="item" data-id="' + f.id + '">' +
                '  <span class="name" title="' + esc(f.artistName) + '">' + esc(f.artistName) + '</span>' +
                '  <span class="note" data-note="' + esc(f.note || '') + '" title="' + esc(f.note || '') + '">' +
                esc(f.note || '—') + '</span>' +
                '  <span class="time">' + esc((f.createdAt || '').slice(5, 16)) + '</span>' +
                '  <span class="ops">' +
                '    <button class="ghost mini" data-act="edit">备注</button>' +
                '    <button class="danger" data-act="del">删除</button>' +
                '  </span>' +
                '</div>';
        }).join('');
    }

    function loadFavorites() {
        return getJSON('/api/favorite').then(function (rows) {
            favorites = rows || [];
            renderFavorites();
        });
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
                return Promise.all([loadFavorites(), refreshOverviewCounters()]);
            })
            .catch(function (e) {
                toast(e.message, true);
            });
    }

    function editFavoriteNote(item, id) {
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
                return loadFavorites();
            })
            .catch(function (e) {
                toast(e.message, true);
            });
    }

    function deleteFavorite(id) {
        getJSON('/api/favorite/' + id, { method: 'DELETE' })
            .then(function () {
                toast('已取消关注');
                return Promise.all([loadFavorites(), refreshOverviewCounters()]);
            })
            .catch(function (e) {
                toast(e.message, true);
            });
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
                editFavoriteNote(item, id);
            } else if (act === 'save') {
                saveFavoriteNote(item, id);
            } else if (act === 'cancel') {
                loadFavorites();
            }
        });
    }

    /* ------------------------------------------------------------------
     * 9. 交互件 2：歌曲打标签
     * ------------------------------------------------------------------ */
    var selectedSong = null;
    var tagTimer = null;

    function highlightResult(trackId) {
        var nodes = document.querySelectorAll('#song-results .search-result');
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
            return '' +
                '<div class="search-result" data-track="' + esc(s.trackId) + '" data-name="' + esc(s.trackName) +
                '" data-artist="' + esc(s.artist) + '">' +
                '  <span class="rk">' + (i + 1) + '</span>' +
                '  <span class="song" title="' + esc(s.trackName) + '">' + esc(s.trackName) + '</span>' +
                '  <span class="artist" title="' + esc(s.artist) + '">' + esc(s.artist) + '</span>' +
                '  <span class="pop">' + s.popularity + '</span>' +
                '</div>';
        }).join('');

        if (selectedSong) {
            highlightResult(selectedSong.trackId);
        }
    }

    function searchSongs(keyword) {
        if (!keyword) {
            return;
        }
        getJSON('/api/song/search?q=' + encodeURIComponent(keyword) + '&limit=6')
            .then(renderSongResults)
            .catch(function (e) {
                toast(e.message, true);
            });
    }

    function selectSong(el) {
        selectedSong = {
            trackId: el.getAttribute('data-track'),
            trackName: el.getAttribute('data-name'),
            artist: el.getAttribute('data-artist')
        };

        document.getElementById('selected-song').style.display = 'flex';
        document.getElementById('selected-title').textContent =
            selectedSong.trackName + ' · ' + selectedSong.artist;

        highlightResult(selectedSong.trackId);
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
        if (!selectedSong) {
            return Promise.resolve();
        }
        return getJSON('/api/tag?trackId=' + encodeURIComponent(selectedSong.trackId))
            .then(function (rows) {
                renderTags(rows || []);
            })
            .catch(function (e) {
                toast(e.message, true);
            });
    }

    function addTag() {
        if (!selectedSong) {
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

        postJSON('/api/tag', { trackId: selectedSong.trackId, tagName: tag })
            .then(function () {
                input.value = '';
                toast('已添加标签「' + tag + '」');
                return Promise.all([loadTags(), refreshOverviewCounters()]);
            })
            .catch(function (e) {
                toast(e.message, true);
            });
    }

    function deleteTag(id) {
        getJSON('/api/tag/' + id, { method: 'DELETE' })
            .then(function () {
                toast('标签已删除');
                return Promise.all([loadTags(), refreshOverviewCounters()]);
            })
            .catch(function (e) {
                toast(e.message, true);
            });
    }

    function bindTags() {
        var q = document.getElementById('song-q');

        q.addEventListener('input', function () {
            clearTimeout(tagTimer);
            var keyword = q.value.trim();
            if (!keyword) {
                document.getElementById('song-results').innerHTML = '<div class="empty">输入关键词找歌</div>';
                return;
            }
            tagTimer = setTimeout(function () {
                searchSongs(keyword);
            }, 320);
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
            var row = e.target.closest('.search-result');
            if (row) {
                selectSong(row);
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

    /* ------------------------------------------------------------------
     * 10. 概览 KPI
     * ------------------------------------------------------------------ */
    function refreshOverviewCounters() {
        return getJSON('/api/overview').then(function (o) {
            document.getElementById('kpi-fav').textContent = o.favorites;
            document.getElementById('kpi-tag').textContent = o.tags;
        }).catch(function () { /* 计数刷新失败不影响交互结果 */ });
    }

    function renderOverview(o) {
        countUp(document.getElementById('kpi-rows'), o.rows);
        countUp(document.getElementById('kpi-songs'), o.songs);
        countUp(document.getElementById('kpi-artists'), o.artists);
        countUp(document.getElementById('kpi-albums'), o.albums);
        countUp(document.getElementById('kpi-pop'), o.avgPopularity, 2);
        document.getElementById('kpi-fav').textContent = o.favorites;
        document.getElementById('kpi-tag').textContent = o.tags;
    }

    /* ------------------------------------------------------------------
     * 11. 启动
     * ------------------------------------------------------------------ */
    function boot() {
        Promise.all([
            getJSON('/api/overview'),
            getJSON('/api/artist/quadrant'),
            getJSON('/api/artist/distribution'),
            getJSON('/api/artist/top?limit=20'),
            getJSON('/api/album/bins'),
            getJSON('/api/artist/span?limit=20'),
            getJSON('/api/song/scatter')
        ]).then(function (res) {
            renderOverview(res[0]);
            renderQuadrant(res[1]);
            renderDistribution(res[2]);
            renderTop(res[3]);
            renderAlbum(res[4]);
            renderSpan(res[5]);
            renderScatter(res[6]);
        }).catch(function (e) {
            toast('数据加载失败：' + e.message, true);
            console.error(e);
        });

        bindFavorites();
        bindTags();

        loadFavorites().catch(function (e) {
            toast('关注列表加载失败：' + e.message, true);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();