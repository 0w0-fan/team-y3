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

    /**
     * 舞台等比缩放：1920×1080 的设计稿缩放到当前窗口，居中、留黑边、不出现滚动条。
     * 因为舞台内部像素恒定，所以图表不需要监听 resize 重绘 —— 这是本方案最省心的地方。
     */
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
    /**
     * 统一注册定时任务，并在标签页隐藏时自动跳过这一拍。
     * 大屏要 7×24 小时挂在墙上，切到后台还全速跑动画既费电又会让 ECharts 队列堆积。
     * @param {number} ms   间隔毫秒
     * @param {Function} fn 回调
     * @return {number} setInterval 的句柄（预留手动清除用）
     */
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
    /**
     * KPI 数字滚动动画：0 → 目标值，1.2 秒 easeOut。
     * 用 requestAnimationFrame 而不是 setInterval，动画结束自动停止，不会留下定时器。
     * @param {HTMLElement} el       要写入数字的元素
     * @param {number} target        目标值
     * @param {number} [decimals=0]  保留几位小数（平均热度用 2 位）
     */
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

    /**
     * 顶部实时时钟：yyyy-MM-dd HH:mm:ss，每秒刷新一次（大屏的「活着的证据」）。
     */
    function tickClock() {
        var d = new Date();
        document.getElementById('clock').textContent =
            d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
            pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    /* ==================================================================
     * 3. 图 1：逐年歌曲数 × 平均热度（双轴 + 窗口自动巡航）
     * ================================================================== */
    /**
     * 图 1：逐年歌曲数 × 平均热度（双轴组合图）
     *   横轴：发行年份，类目轴，1957–2019 共 62 项
     *   左纵轴：歌曲数（首）—— 柱状系列，青色渐变，数据量级 1 ~ 7,406
     *   右纵轴：平均热度 —— 折线系列，金色发光 + 面积渐变，固定 0~100
     *   交互：dataZoom 只开 24 年窗口，每 1.5 秒右移一格循环播放，形成「巡航」动效
     *   数据：/api/year/trend（2020 年数据被截断，默认不取）
     */
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
    /**
     * 图 2：歌手作品数长尾分布（对数柱状图）
     *   横轴：作品数分箱 1 / 2 / 3 / 4 / 5 / 6-10 / 11-20 / 21+（类目轴）
     *   纵轴：歌手数，**对数刻度** —— 首箱 6,496 位与末箱 139 位差 47 倍，
     *         线性轴会把后面几箱压成一条线，所以 min=100 / max=10000 取 log
     *   样式：最后一箱（21+ 高产歌手）用金色高亮，其余青色；柱顶标数值
     *   数据：/api/artist/distribution（8 个箱固定顺序，缺箱补 0）
     */
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
    /**
     * 图 3：平均热度 TOP20（横向条形图 + 轮播高亮）
     *   纵轴：歌手名（类目轴），按平均热度降序 —— 注意数据是反着喂的，
     *         因为 ECharts 类目轴默认自下而上，reverse() 之后第 1 名才在顶部
     *   横轴：平均热度 0~100，柱端标数值
     *   样式：颜色随热度线性变化（40 分以下偏淡青，70 分以上转金），柱端圆角
     *   动效：每 2.4 秒高亮下一条，配合 tooltip 观察明细
     *   数据：/api/artist/top?limit=20（只统计作品数 ≥ 3 的歌手）
     */
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
    /**
     * 图 4：歌手活跃年份跨度 TOP20（横向区间条）
     *   做法：用两个堆叠系列拼出「区间条」——
     *         offset 系列：从 1940 到该歌手最早年份，颜色透明，只用来占位；
     *         跨度系列：长度 = maxYear - minYear，青→紫渐变
     *   横轴：年份（数值轴，显示时 +1940 还原成真实年份）
     *   纵轴：歌手名，inverse 让跨度最大的排在最上面
     *   数据：/api/artist/span?limit=20（作品数 ≥ 3 且年份非空）
     */
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
    /**
     * 图 5（主视觉）：作品数 × 平均热度 四象限气泡图
     *   横轴：作品数，**对数轴** —— 从 3 首到 130 首跨两个数量级，
     *         线性轴会把 2,400 多个点全挤在左侧
     *   纵轴：平均热度 0~100
     *   分割线：x = 作品中位数 5，y = 全局均值 42.48（markLine 虚线）
     *   气泡大小：该歌手的专辑数（v2 新维度），sqrt 开方避免大值过分夸张
     *   四个系列：明星区/精品区/走量区/长尾区，各自一种颜色 + 图例可点选过滤
     *   markArea：给「多且热」和「少而热」两个象限铺一层淡底色
     *   数据：/api/artist/quadrant（2,486 位歌手）
     */
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

        /**
         * 气泡大小：按专辑数开方映射，避免「专辑多的歌手」把点撑得过份大。
         * 上限压到 22px（原来 31px）：2,486 个点里大点越少，重绘越轻。
         */
        function size(val) {
            var albums = val[3] || 1;
            return 4 + Math.sqrt(albums / Math.max(maxAlbum, 1)) * 18;
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
                // 注意：这里刻意不加 shadowBlur —— 2,486 个点每点一次阴影会把绘制成本放大十几倍，
                // 实测就是主视觉卡顿的元凶。发光效果只在鼠标悬停（emphasis）时给。
                itemStyle: {
                    color: def.color,
                    opacity: def.key === 'tail' ? 0.5 : 0.8
                },
                emphasis: {
                    scale: 1.35,
                    itemStyle: {
                        opacity: 1,
                        borderColor: '#fff',
                        borderWidth: 1,
                        shadowBlur: 12,
                        shadowColor: 'rgba(34,211,238,0.9)'
                    }
                },
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
            // 入场动画保留（有仪式感），但用 progressive 分帧绘制，避免 2,486 个点一次性铺开卡住主线程
            animationDuration: 900,
            animationEasing: 'cubicOut',
            progressive: 1200,
            progressiveThreshold: 800,
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
     * 8. 图 6：专辑曲目数 × 歌曲平均热度（课程要求的第 4 张图）
     * ================================================================== */
    /**
     * 横轴：专辑曲目数分箱 2 / 3-4 / 5-9 / 10+（只统计曲目数 ≥ 2 的专辑）
     * 纵轴：该箱内**全部歌曲**的平均热度（歌曲加权，不是专辑等权）
     * 柱顶标签：第一行平均热度，第二行该箱专辑数
     * 数据：/api/album/bins（4 个箱，专辑数 2169 / 1217 / 464 / 89）
     */
    function renderAlbum(rows) {
        var NL = String.fromCharCode(10);   // 换行符（柱顶标签要分两行显示）
        var chart = echarts.init(document.getElementById('chart-album'));
        var bins = rows.map(function (r) { return r.bin + ' 首'; });
        var vals = rows.map(function (r) { return r.avgPop; });
        var albums = rows.map(function (r) { return r.albums; });
        var min = Math.floor(Math.min.apply(null, vals) - 2);
        var max = Math.ceil(Math.max.apply(null, vals) + 2);

        chart.setOption({
            grid: { left: 44, right: 16, top: 30, bottom: 26 },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(244,114,182,0.07)' } },
                formatter: function (p) {
                    var i = p[0].dataIndex;
                    return '专辑曲目数 <b>' + rows[i].bin + '</b> 首<br/>专辑数 ' + num(rows[i].albums) +
                        ' 张<br/>歌曲平均热度 <b style="color:' + C.pink + '">' + rows[i].avgPop.toFixed(2) + '</b>';
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
                type: 'value',
                min: min,
                max: max,
                splitLine: SPLIT,
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
                            color: grad(0, 1, 0, 0, 'rgba(244,114,182,0.12)',
                                i === 0 ? 'rgba(244,114,182,0.9)' : 'rgba(167,139,250,0.78)')
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
                        return p.value.toFixed(1) + NL + num(albums[p.dataIndex]) + '张';
                    }
                }
            }]
        });
    }

    /* ==================================================================
     * 9. 图 7：热度 × 歌曲时长（课程要求的第 6 张图，28,356 点）
     * ================================================================== */
    /**
     * 横轴：时长（分钟，0~9），纵轴：热度（0~100），一个点一首歌
     * 性能：开 large + largeThreshold + progressive，否则 2.8 万个点会把浏览器拖卡
     * 数据：/api/song/scatter（实测 JSON 502 KB / 0.13 秒）
     */
    function renderScatter(d) {
        var chart = echarts.init(document.getElementById('chart-scatter'));
        var data = d.points.map(function (p) { return [p.x, p.y]; });

        chart.setOption({
            grid: { left: 42, right: 16, top: 26, bottom: 26 },
            tooltip: Object.assign({
                trigger: 'item',
                formatter: function (p) {
                    return '时长 <b style="color:' + C.accent + '">' + p.data[0] + '</b> 分<br/>热度 <b style="color:' +
                        C.warm + '">' + p.data[1] + '</b>';
                }
            }, tip()),
            xAxis: {
                type: 'value',
                min: 0,
                max: 9,
                name: '时长（分钟）',
                nameTextStyle: { color: C.textSub, fontSize: 10 },
                axisLine: { lineStyle: { color: C.axis } },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, { fontSize: 10 }),
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: 100,
                name: '热度',
                nameTextStyle: { color: C.textSub, fontSize: 10, padding: [0, 0, 0, -12] },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, { fontSize: 10 }),
                splitLine: SPLIT
            },
            series: [{
                type: 'scatter',
                large: true,
                largeThreshold: 2000,
                progressive: 5000,
                symbolSize: 3,
                itemStyle: { color: 'rgba(34,211,238,0.38)' },
                emphasis: { itemStyle: { color: C.warm } },
                data: data
            }]
        });
    }

    /* ==================================================================
     * 10. 合并面板：按歌手搜索（关注歌手） / 按歌曲搜索（打标签）
     *     两种模式共用一个搜索框，点顶部两个按钮直接切换（不是下拉框）；
     *     默认「按歌手搜索」，**不记忆**上次选择，刷新后回到默认项。
     * ================================================================== */
    var MODE = 'artist';          // 当前模式：'artist' 按歌手 | 'song' 按歌曲
    var favorites = [];           // artist_favorite 表的缓存
    var tags = [];                // 当前选中歌曲的标签缓存
    var pickedSong = null;        // 歌曲模式下选中的那首歌
    var searchTimer = null;       // 输入防抖

    /* ---------- 10.1 模式切换：面板、标题、计数、提示文字全部跟着变 ---------- */

    function setMode(mode) {
        MODE = mode;
        var isArtist = (mode === 'artist');

        var btns = document.querySelectorAll('#mode-switch .mode-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === mode);
        }

        document.getElementById('pane-artist').style.display = isArtist ? 'flex' : 'none';
        document.getElementById('pane-song').style.display = isArtist ? 'none' : 'flex';
        document.getElementById('search-title').textContent = isArtist ? '关注歌手' : '歌曲打标签';

        // 切换后搜索框的提示文字也换一套（歌手名 / 歌名）
        document.getElementById('q-input').placeholder = isArtist
            ? '歌手名，如 Billie Eilish（不区分大小写）'
            : '歌名，如 lovely（只匹配歌名）';
        document.getElementById('q-input').value = '';
        document.getElementById('result-list').innerHTML =
            '<div class="empty">' + (isArtist ? '输入歌手名开始搜索' : '输入歌名开始搜索') + '</div>';

        refreshCountLabel();
        if (isArtist) {
            loadFavorites();
        } else {
            loadTags();
        }
    }

    function refreshCountLabel() {
        document.getElementById('search-count').textContent = (MODE === 'artist')
            ? (favorites.length + ' 条')
            : (tags.length + ' 个标签');
        document.getElementById('kpi-fav').textContent = favorites.length;
        document.getElementById('kpi-tag').textContent = tags.length;
    }

    /* ---------- 10.2 搜索：按模式走不同接口 ---------- */

    function doSearch(keyword) {
        if (!keyword) {
            return;
        }
        if (MODE === 'artist') {
            getJSON('/api/artist/search?q=' + encodeURIComponent(keyword) + '&limit=6')
                .then(renderArtistResults)
                .catch(function (e) { toast(e.message, true); });
        } else {
            getJSON('/api/song/search?q=' + encodeURIComponent(keyword) + '&limit=6')
                .then(renderSongResults)
                .catch(function (e) { toast(e.message, true); });
        }
    }

    /** 歌手候选：点一下把名字填进输入框，再点「关注」 */
    function renderArtistResults(rows) {
        var box = document.getElementById('result-list');

        if (!rows || !rows.length) {
            box.innerHTML = '<div class="empty">库里没有匹配的歌手，也可以直接点「关注」把名字存下来</div>';
            return;
        }

        box.innerHTML = rows.map(function (a, i) {
            return '<div class="pick-item" data-name="' + esc(a.name) + '">' +
                '<span class="rk">' + (i + 1) + '</span>' +
                '<span class="song" title="' + esc(a.name) + '">' + esc(a.name) + '</span>' +
                '<span class="artist">' + a.works + ' 首</span>' +
                '<span class="pop">' + a.avgPop.toFixed(1) + '</span></div>';
        }).join('');
    }

    /** 歌曲候选：点一下选中，然后打标签 */
    function renderSongResults(rows) {
        var box = document.getElementById('result-list');

        if (!rows || !rows.length) {
            box.innerHTML = '<div class="empty">没有找到匹配的歌名</div>';
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
            var nodes = document.querySelectorAll('#result-list .pick-item');
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].classList.toggle('active', nodes[i].getAttribute('data-track') === pickedSong.trackId);
            }
        }
    }

    /* ---------- 10.3 关注歌手 ---------- */

    function loadFavorites() {
        return getJSON('/api/favorite').then(function (rows) {
            favorites = rows || [];
            renderFavorites();
            refreshCountLabel();
        });
    }

    function renderFavorites() {
        var box = document.getElementById('fav-list');

        if (!favorites.length) {
            box.innerHTML = '<div class="empty">还没有关注的歌手</div>';
            return;
        }

        box.innerHTML = favorites.map(function (f) {
            // 库里没有这位歌手时打一个「库外」标，提醒它不是数据集里的真实歌手
            var flag = f.inDataset
                ? '<span class="tag-in">库内</span>'
                : '<span class="tag-out">库外</span>';
            return '<div class="item" data-id="' + f.id + '">' +
                '<span class="name" title="' + esc(f.artistName) + '">' + esc(f.artistName) + '</span>' +
                flag +
                '<span class="note" data-note="' + esc(f.note || '') + '" title="' + esc(f.note || '') + '">' +
                esc(f.note || '—') + '</span>' +
                '<span class="time">' + esc((f.createdAt || '').slice(5, 16)) + '</span>' +
                '<span class="ops">' +
                '<button class="ghost mini" data-act="edit">备注</button>' +
                '<button class="danger" data-act="del">删除</button>' +
                '</span></div>';
        }).join('');
    }

    function addFavorite() {
        var nameInput = document.getElementById('q-input');
        var noteInput = document.getElementById('fav-note');
        var name = nameInput.value.trim();

        if (!name) {
            toast('先填写或选择歌手名', true);
            nameInput.focus();
            return;
        }

        postJSON('/api/favorite', { artistName: name, note: noteInput.value.trim() })
            .then(function (saved) {
                noteInput.value = '';
                // 服务端会判断这位歌手在不在数据集里，这里把结果如实告诉用户
                toast(saved.inDataset ? ('已关注 ' + name + '（库内）') : ('已关注 ' + name + '（库外，数据集中没有）'));
                return loadFavorites();
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
                return loadFavorites();
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function deleteFavorite(id) {
        getJSON('/api/favorite/' + id, { method: 'DELETE' })
            .then(function () {
                toast('已取消关注');
                return loadFavorites();
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function bindFavorites() {
        document.getElementById('fav-add').addEventListener('click', addFavorite);
        document.getElementById('fav-note').addEventListener('keydown', function (e) {
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

    /* ---------- 10.4 歌曲打标签 ---------- */

    function pickSong(el) {
        pickedSong = {
            trackId: el.getAttribute('data-track'),
            trackName: el.getAttribute('data-name'),
            artist: el.getAttribute('data-artist')
        };
        document.getElementById('picked').style.display = 'flex';
        document.getElementById('picked-title').textContent = pickedSong.trackName + ' · ' + pickedSong.artist;
        document.getElementById('result-list').querySelectorAll('.pick-item').forEach(function (n) {
            n.classList.toggle('active', n.getAttribute('data-track') === pickedSong.trackId);
        });
        loadTags();
    }

    function loadTags() {
        if (!pickedSong) {
            return Promise.resolve();
        }
        return getJSON('/api/tag?trackId=' + encodeURIComponent(pickedSong.trackId))
            .then(function (rows) {
                tags = rows || [];
                renderTags();
                refreshCountLabel();
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function renderTags() {
        var box = document.getElementById('tag-list');

        if (!tags.length) {
            box.innerHTML = '<div class="empty" style="width:100%">这首歌还没有标签</div>';
            return;
        }

        box.innerHTML = tags.map(function (t) {
            return '<span class="tag-chip">' + esc(t.tagName) +
                '<i data-id="' + t.id + '" title="删除">×</i></span>';
        }).join('');
    }

    function addTag() {
        if (!pickedSong) {
            toast('先在搜索结果里点一首歌', true);
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
                toast('已给《' + pickedSong.trackName + '》打上「' + tag + '」');
                return loadTags();
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function deleteTag(id) {
        getJSON('/api/tag/' + id, { method: 'DELETE' })
            .then(function () {
                toast('标签已删除');
                return loadTags();
            })
            .catch(function (e) { toast(e.message, true); });
    }

    function bindTags() {
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

    /* ---------- 10.5 搜索框与结果列表：两种模式共用 ---------- */

    function bindSearch() {
        var q = document.getElementById('q-input');

        // 输入防抖 320ms，避免每敲一个字都打一次库
        q.addEventListener('input', function () {
            clearTimeout(searchTimer);
            var keyword = q.value.trim();
            if (!keyword) {
                document.getElementById('result-list').innerHTML =
                    '<div class="empty">' + (MODE === 'artist' ? '输入歌手名开始搜索' : '输入歌名开始搜索') + '</div>';
                return;
            }
            searchTimer = setTimeout(function () { doSearch(keyword); }, 320);
        });

        q.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                doSearch(q.value.trim());
            }
        });

        document.getElementById('q-btn').addEventListener('click', function () {
            doSearch(q.value.trim());
        });

        document.getElementById('result-list').addEventListener('click', function (e) {
            var row = e.target.closest('.pick-item');
            if (!row) {
                return;
            }
            if (MODE === 'artist') {
                // 歌手模式：点一下把名字填进输入框，光标移到备注，方便接着关注
                document.getElementById('q-input').value = row.getAttribute('data-name');
                document.getElementById('fav-note').focus();
            } else {
                pickSong(row);
            }
        });

        document.getElementById('mode-switch').addEventListener('click', function (e) {
            var btn = e.target.closest('.mode-btn');
            if (btn) {
                setMode(btn.getAttribute('data-mode'));
            }
        });
    }

    /* ---------- 10.6 顶部 KPI 的两个计数 ---------- */

    function refreshCounters() {
        return getJSON('/api/overview').then(function (o) {
            document.getElementById('kpi-fav').textContent = o.favorites;
            document.getElementById('kpi-tag').textContent = o.tags;
        }).catch(function () { /* 计数刷新失败不影响写库结果 */ });
    }

    /* ==================================================================
     * 12. KPI 翻牌
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
     * 13. 启动
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
            getJSON('/api/artist/quadrant'),
            getJSON('/api/album/bins'),
            getJSON('/api/song/scatter')
        ]).then(function (res) {
            renderKPI(res[0]);
            renderTrend(res[1]);
            renderDistribution(res[2]);
            renderTop(res[3]);
            renderSpan(res[4]);
            renderQuadrant(res[5]);
            renderAlbum(res[6]);
            renderScatter(res[7]);
        }).catch(function (e) {
            toast('数据加载失败：' + e.message, true);
            console.error(e);
        });

        bindSearch();      // 搜索框 + 结果列表（两种模式共用）
        bindFavorites();   // 关注歌手的按钮与列表
        bindTags();        // 标签的按钮与列表

        setMode('artist');   // 默认「按歌手搜索」，不记忆上次选择
        loadFavorites().catch(function (e) { toast('关注列表加载失败：' + e.message, true); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
