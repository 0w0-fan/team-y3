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
        var d = decimals || 0;
        var finalText = d > 0 ? Number(target).toFixed(d) : num(target);

        /**
         * 页面在后台（document.hidden）时，浏览器会把 requestAnimationFrame 完全停掉，
         * 动画帧一帧都不会跑 —— 于是 KPI 会一直停在 0。
         * 大屏是要 7×24 挂着的，切到别的标签页再回来不能看到一排 0，
         * 所以后台时直接写终值，不做滚动。
         */
        if (document.hidden) {
            el.textContent = finalText;
            return;
        }

        var duration = 1200;
        var t0 = performance.now();

        function frame(now) {
            var p = Math.min((now - t0) / duration, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            var v = target * eased;
            el.textContent = d > 0 ? v.toFixed(d) : num(Math.round(v));
            if (p < 1) {
                requestAnimationFrame(frame);
            } else {
                el.textContent = finalText;
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
     *   交互：静态展示，不做自动动画（62 年一次画全，方便对着看）
     *   数据：/api/year/trend（2020 年数据被截断，默认不取）
     */
    function renderTrend(d) {
        var chart = echarts.init(document.getElementById('chart-trend'));
        var years = d.points.map(function (p) { return p.year; });
        var songs = d.points.map(function (p) { return p.songs; });
        var pops = d.points.map(function (p) { return p.avgPop; });

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

        // 趋势图不做任何自动动画：62 年全量静态展示（之前那种窗口巡航看着像抽搐，已删除）
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
     * 7. 可配置图表（默认落在中间最大的位置）
     *    三个选择器：维度 × 度量 × 图表类型（界面文案用「图表」，不用「图形」）
     *
     *    最终保留 7 种图表：
     *      气泡散点（scatter）/ 面积图（area）/ 柱状图（bar）/
     *      横向条形（barH）/ 环形图（ring）/ 玫瑰图（rose）
     *
     *    已删除的图表类型及原因（答辩时会被问）：
     *      · 折线图 —— 面积图已含折线骨架，多一层填充，信息只多不少
     *      · 饼图   —— 与环形图只差一个内半径，视觉区分度不够
     *      · 雷达图 —— 单度量雷达等于柱状图弯成圆，不增加信息；20 轴/62 轴无法阅读
     *      · 矩形树图 / 漏斗图 —— 自带配色梯度与图例排布，与页面固定青蓝主题冲突
     * ================================================================== */

    /**
     * 维度字典 —— 三方约束矩阵（v5）
     *
     * 「维度 × 度量 × 图表」不能随便组合，这里有两条硬约束：
     *
     * ① **图表类型受数据形状限制**（写死在 types 里）：
     *      · 类目 62 个的有序时间序列 → 只有 area / bar
     *        （barH 62 行挤在 546px 高里每行 8px；环图 62 个扇区无法阅读，全部不留）
     *      · 类目 4~8 个的分箱 → bar / barH / area / ring / rose 都可以
     *      · 类目 20 个的排行榜 → 只有 barH / bar
     *        （类目是歌手名，顺序无时间含义，趋势语义不成立；占比语义也不成立）
     *      · 二维散点（2,486 个歌手） → 只有气泡散点
     *
     * ② **度量受图表语义限制**（见 comboOk）：
     *      · 环图 / 玫瑰图 表示「占比」，**只能用可加和的度量**（歌曲数、歌手数、专辑数、作品数）；
     *        用「平均热度 / 平均时长 / 最高热度 / 年份跨度」做占比在语义上是错的
     *        （平均值不构成一个整体，占比加起来没有意义）→ 选了环形图，这些度量就不出现。
     *
     * 两个方向都是**动态过滤**，不是「置灰」：选了度量 → 不兼容的图表直接消失；
     * 选了图表 → 不兼容的度量直接消失。见 syncSelectors()。
     */
    var DIMS = {
        /* 四象限的本质：x = 作品数（产量），y = 平均热度（热度）。
           度量在这里映射「气泡大小」这个第三维，所以只留不跟 x/y 重复的两项：
           作品数与平均热度已经在轴上，再当气泡大小就是自己映自己，已删除。
           雷达图也一并去掉：四个区域的五维画像与「选度量」无关，留着会误导。 */
        scatter_artist: {
            label: '歌手分布（作品数 × 热度）',
            measures: ['albumCount', 'avgDur'],
            types: ['scatter']
        },
        year: {
            label: '发行年份',
            measures: ['songs', 'avgPop', 'artists', 'albums', 'avgDur', 'maxPop'],
            types: ['area', 'bar']
        },
        artist_bins: {
            label: '歌手作品数分箱',
            measures: ['artists', 'songs', 'avgPop'],
            types: ['bar', 'barH', 'area', 'ring', 'rose']
        },
        /* 原 avgDur 四箱只差 9.6 秒（3.80~3.96 分），四根柱子几乎等高，
           属于「有选项但看不出任何东西」，该度量已删除 */
        album_bins: {
            label: '专辑曲目数分箱',
            measures: ['albums', 'songs', 'avgPop'],
            types: ['bar', 'barH', 'area', 'ring', 'rose']
        },
        pop_level: {
            label: '热度分档',
            measures: ['songs', 'avgPop', 'avgDur'],
            types: ['bar', 'barH', 'area', 'ring', 'rose']
        },
        dur_bins: {
            label: '歌曲时长分箱',
            measures: ['songs', 'avgPop', 'avgDur'],
            types: ['bar', 'barH', 'area', 'ring', 'rose']
        },
        /* 排行榜的两个限制：
           ① 不是「构成比例」—— 20 个类目的环图/玫瑰图既读不出排序也读不出占比
             （强制聚合到 12 项 + 其它 8 项反而把榜尾抹掉），所以不提供；
           ② 类目是歌手名，顺序本身没有时间或数值上的连续含义，
             面积图/折线图的「趋势」语义在这里不成立，所以也不提供。
           排行榜只保留能表达「长短对比」的柱状与横向条形。 */
        artist_top: {
            label: '歌手 TOP20',
            measures: ['avgPop', 'works', 'albumCount', 'avgDur'],
            types: ['barH', 'bar']
        },
        artist_span: {
            label: '歌手活跃跨度 TOP20',
            measures: ['span', 'works', 'avgPop', 'albumCount'],
            types: ['barH', 'bar']
        }
    };

    /** 可加和的度量：只有它们能表达「占比」，因此只有它们能做环形图 / 玫瑰图 */
    var ADDITIVE = {
        songs: true, artists: true, albums: true,
        works: true, albumCount: true, artistCount: true
    };

    /** 占比类图表：只能配可加和度量 */
    var SHARE_TYPES = { ring: true, rose: true };

    /**
     * 某个「图表 + 度量」的组合在语义上是否成立。
     * 目前只有一条规则：占比类图表不能用平均值/极值/跨度。
     */
    function comboOk(type, measure) {
        if (SHARE_TYPES[type]) {
            return !!ADDITIVE[measure];
        }
        return true;
    }

    /** 当前维度 + 当前度量下，实际可用的图表列表 */
    function typesFor(dimKey, measure) {
        var d = DIMS[dimKey];
        if (!d) {
            return [];
        }
        return d.types.filter(function (t) { return comboOk(t, measure); });
    }

    /** 当前维度 + 当前图表下，实际可用的度量列表 */
    function measuresFor(dimKey, type) {
        var d = DIMS[dimKey];
        if (!d) {
            return [];
        }
        return d.measures.filter(function (m) { return comboOk(type, m); });
    }

    var MEASURE_LABEL = {
        avgPop: '平均热度',
        maxPop: '最高热度',
        songs: '歌曲数',
        artists: '歌手数',
        albums: '专辑数',
        artistCount: '歌手数',
        works: '作品数',
        albumCount: '专辑数',
        span: '年份跨度',
        avgDur: '平均时长（分钟）'
    };

    /** 度量单位后缀：柱端/标签显示用 */
    var MEASURE_UNIT = {
        avgPop: '', maxPop: '', songs: ' 首', artists: ' 位', albums: ' 张',
        artistCount: ' 位', works: ' 首', albumCount: ' 张', span: ' 年', avgDur: ' 分'
    };

    var TYPE_LABEL = {
        scatter: '气泡散点',
        area: '面积图',
        bar: '柱状图',
        barH: '横向条形',
        ring: '环形图',
        rose: '玫瑰图'
    };

    var CUSTOM_STORE = 'spotify-dash-chart-v1';
    var DATA = {};
    var customChart = null;
    var CFG = { dim: 'scatter_artist', measure: 'avgPop', type: 'scatter' };

    try {
        var savedCfg = JSON.parse(localStorage.getItem(CUSTOM_STORE) || 'null');
        if (savedCfg && DIMS[savedCfg.dim]) {
            CFG = savedCfg;
        }
    } catch (e) { /* 读不出来就用默认 */ }

    /* ---------- 7.1 各维度的数据装配 ---------- */

    /** 把散点按规则分箱（热度分档 / 时长分箱都用它） */
    function binPoints(points, edges, labels, picker) {
        var songs = new Array(labels.length).fill(0);
        var sum = new Array(labels.length).fill(0);
        points.forEach(function (p) {
            var v = picker(p);
            for (var i = 0; i < edges.length; i++) {
                if (v < edges[i]) {
                    songs[i] += 1;
                    sum[i] += p.y;
                    return;
                }
            }
        });
        var avg = songs.map(function (n, i) { return n ? Number((sum[i] / n).toFixed(2)) : 0; });
        return { songs: songs, avgPop: avg };
    }

    /**
     * 取某个维度的「类目 + 各度量序列」。
     * 统一返回 { categories: [...], series: { 度量: [...] } }，
     * 散点维度额外返回 points（气泡图要原始点）。
     */
    function datasetOf(dim) {
        if (dim === 'scatter_artist') {
            return { numeric: true, points: (DATA.quadrant || {}).points || [] };
        }

        if (dim === 'year') {
            var pts = (DATA.yearTrend || {}).points || [];
            return {
                categories: pts.map(function (p) { return p.year; }),
                series: {
                    songs: pts.map(function (p) { return p.songs; }),
                    avgPop: pts.map(function (p) { return p.avgPop; }),
                    artists: pts.map(function (p) { return p.artists || 0; }),
                    albums: pts.map(function (p) { return p.albums || 0; }),
                    avgDur: pts.map(function (p) { return p.avgDur || 0; }),
                    maxPop: pts.map(function (p) { return p.maxPop || 0; })
                }
            };
        }

        if (dim === 'artist_bins') {
            var d = DATA.distribution || [];
            return {
                categories: d.map(function (x) { return x.bin + ' 首'; }),
                series: {
                    artists: d.map(function (x) { return x.artists; }),
                    songs: d.map(function (x) { return x.songs || 0; }),
                    avgPop: d.map(function (x) { return x.avgPop || 0; })
                }
            };
        }

        if (dim === 'album_bins') {
            var a = DATA.albumBins || [];
            return {
                categories: a.map(function (x) { return x.bin + ' 首'; }),
                series: {
                    albums: a.map(function (x) { return x.albums; }),
                    songs: a.map(function (x) { return x.songs || 0; }),
                    avgPop: a.map(function (x) { return x.avgPop; }),
                    avgDur: a.map(function (x) { return x.avgDur || 0; })
                }
            };
        }

        if (dim === 'pop_level') {
            var sc = (DATA.scatter || {}).points || [];
            var b = binPoints(sc, [0.5, 30, 60, 80, 101],
                ['0', '1-29', '30-59', '60-79', '80-100'],
                function (p) { return p.y; });
            var durSum = [0, 0, 0, 0, 0];
            var durCnt = [0, 0, 0, 0, 0];
            sc.forEach(function (p) {
                var idx = p.y <= 0 ? 0 : (p.y < 30 ? 1 : (p.y < 60 ? 2 : (p.y < 80 ? 3 : 4)));
                durSum[idx] += p.x;
                durCnt[idx] += 1;
            });
            b.avgDur = durSum.map(function (t, i) {
                return durCnt[i] ? Number((t / durCnt[i]).toFixed(2)) : 0;
            });
            return { categories: ['0', '1-29', '30-59', '60-79', '80-100'], series: b };
        }

        if (dim === 'dur_bins') {
            var sc2 = (DATA.scatter || {}).points || [];
            var b2 = binPoints(sc2, [2, 3, 4, 5, 99],
                ['<2', '2-3', '3-4', '4-5', '5+'],
                function (p) { return p.x; });
            // 各时长档的平均时长（就是档内的实际均值，比档位中心更准）
            var dSum = [0, 0, 0, 0, 0];
            var dCnt = [0, 0, 0, 0, 0];
            sc2.forEach(function (p) {
                var idx = p.x < 2 ? 0 : (p.x < 3 ? 1 : (p.x < 4 ? 2 : (p.x < 5 ? 3 : 4)));
                dSum[idx] += p.x;
                dCnt[idx] += 1;
            });
            b2.avgDur = dSum.map(function (t, i) {
                return dCnt[i] ? Number((t / dCnt[i]).toFixed(2)) : 0;
            });
            return {
                categories: ['<2 分', '2-3 分', '3-4 分', '4-5 分', '5 分以上'],
                series: b2
            };
        }

        if (dim === 'artist_top') {
            var top = (DATA.topArtists || []).slice(0, 20);
            return {
                categories: top.map(function (x) { return x.name; }),
                series: {
                    works: top.map(function (x) { return x.works; }),
                    avgPop: top.map(function (x) { return x.avgPop; }),
                    albumCount: top.map(function (x) { return x.albumCount || 0; }),
                    avgDur: top.map(function (x) { return x.avgDur || 0; })
                }
            };
        }

        if (dim === 'artist_span') {
            var sp = (DATA.spans || []).slice(0, 20);
            return {
                categories: sp.map(function (x) { return x.name; }),
                series: {
                    span: sp.map(function (x) { return x.span; }),
                    works: sp.map(function (x) { return x.works; }),
                    avgPop: sp.map(function (x) { return x.avgPop || 0; }),
                    albumCount: sp.map(function (x) { return x.albumCount || 0; })
                }
            };
        }

        return { categories: [], series: {} };
    }

    /* ---------- 7.2 选择器与兼容性矩阵 ---------- */

    function fillSelect(sel, options, current, enabledSet, labelMap) {
        var html = '';
        options.forEach(function (o) {
            var disabled = enabledSet && enabledSet.indexOf(o) < 0;
            html += '<option value="' + o + '"' +
                (o === current ? ' selected' : '') +
                (disabled ? ' disabled' : '') + '>' +
                ((labelMap && labelMap[o]) || o) + '</option>';
        });
        sel.innerHTML = html;
        sel.disabled = !options.length;
    }

    /**
     * 铺三个下拉框。
     *
     * 关键：这里是**动态过滤**而不是置灰 —— 列表里只放「当前真的画得出来」的选项。
     *   ① 先定维度（8 个固定可选）
     *   ② 度量下拉 = 这个维度支持、且与当前图表语义兼容的度量
     *   ③ 图表下拉 = 这个维度支持、且与当前度量语义兼容的图表
     * 这样用户在任何一个框里都不可能选到「画出来是废图」的组合。
     */
    function syncSelectors() {
        var dim = DIMS[CFG.dim];
        var allDims = Object.keys(DIMS);
        var dimLabel = {};
        allDims.forEach(function (k) { dimLabel[k] = DIMS[k].label; });

        // 维度：全部可选
        fillSelect(document.getElementById('cfg-dim'), allDims, CFG.dim, allDims, dimLabel);

        // 度量：受「当前图表」的语义限制
        var measures = measuresFor(CFG.dim, CFG.type);
        if (measures.indexOf(CFG.measure) < 0) {
            CFG.measure = measures[0];
        }
        fillSelect(document.getElementById('cfg-measure'), measures, CFG.measure, measures, MEASURE_LABEL);

        // 图表：受「当前度量」的语义限制
        var types = typesFor(CFG.dim, CFG.measure);
        if (types.indexOf(CFG.type) < 0) {
            CFG.type = types[0];
        }
        fillSelect(document.getElementById('cfg-type'), types, CFG.type, types, TYPE_LABEL);
    }

    /**
     * 切换维度后把度量/图表收敛到合法组合。
     * 顺序很重要：先按旧图表收敛度量，再按新度量收敛图表，否则会互相打架。
     */
    function normalizeCfg(keepType) {
        var dim = DIMS[CFG.dim];
        if (!dim) {
            CFG.dim = 'scatter_artist';
            dim = DIMS[CFG.dim];
        }

        // 图表必须是这个维度支持的
        if (dim.types.indexOf(CFG.type) < 0) {
            CFG.type = dim.types[0];
        }

        // 度量必须同时满足「维度支持」+「与当前图表语义兼容」
        var measures = measuresFor(CFG.dim, CFG.type);
        if (measures.indexOf(CFG.measure) < 0) {
            CFG.measure = measures[0];
        }

        // 反过来再兜一次：图表必须与定下来的度量兼容
        var types = typesFor(CFG.dim, CFG.measure);
        if (types.indexOf(CFG.type) < 0) {
            CFG.type = types[0];
        }

        void keepType;
    }

    /* ---------- 7.3 渲染入口 ---------- */

    function renderCustom() {
        var box = document.getElementById('chart-custom');
        if (!box) {
            return;
        }
        if (!customChart) {
            customChart = echarts.init(box);
        }

        var dim = CFG.dim;
        var measure = CFG.measure;
        var type = CFG.type;
        var data = datasetOf(dim);
        var title = document.getElementById('custom-title');
        var sub = document.getElementById('custom-sub');

        var option;

        if (type === 'scatter') {
            option = buildScatter(data, measure);
            title.textContent = '作品数 × 平均热度 四象限';
            sub.innerHTML = '作品数 ≥ 3 · <b>' + num((DATA.quadrant || {}).count || 0) +
                '</b> 位歌手 · 气泡大小 = <b>' + MEASURE_LABEL[measure] + '</b>';
        } else if (type === 'ring' || type === 'rose') {
            option = buildPie(data, measure, type);
            title.textContent = DIMS[dim].label + ' · ' +
                (type === 'rose' ? '玫瑰图' : '占比');
            sub.textContent = TYPE_LABEL[type] + ' · 度量 = ' + MEASURE_LABEL[measure];
        } else if (type === 'area') {
            option = buildLine(data, measure, true);
            title.textContent = DIMS[dim].label + ' · 面积走势';
            sub.textContent = TYPE_LABEL[type] + ' · 度量 = ' + MEASURE_LABEL[measure];
        } else {
            option = buildBar(data, measure, type === 'barH');
            title.textContent = DIMS[dim].label + ' · ' + MEASURE_LABEL[measure];
            sub.textContent = TYPE_LABEL[type] + ' · 共 ' + (data.categories || []).length + ' 项';
        }

        customChart.setOption(option, true);


    }

    /* ---------- 7.4 各类图表装配 ---------- */

    /**
     * 四象限气泡：x = 作品数（产量），y = 平均热度（热度）。
     *
     * 度量在这里映射到**气泡大小**（第三维）：
     *   · 专辑数   → 气泡越大，说明这位歌手的作品摊在越多张专辑上（散装 vs 集结）
     *   · 平均时长 → 气泡越大，说明这位歌手偏长篇
     * 象限底色与分割线始终按 x/y 算，不随度量变化 —— 变的是气泡大小与提示框。
     *
     * @param {Object} data    datasetOf('scatter_artist') 的结果
     * @param {string} measure 气泡大小映射的度量键
     */
    function buildScatter(data, measure) {
        var points = data.points || [];
        var isDur = (measure === 'avgDur');
        var sizeOf = function (p) {
            return isDur ? (p.avgDur || 0) : (p.albumCount || 1);
        };
        var raw = points.map(function (p) {
            return { x: p.works, y: p.avgPop, size: sizeOf(p), name: p.name, album: p.albumCount || 0, dur: p.avgDur || 0 };
        });
        var xs = raw.map(function (p) { return p.x; }).sort(function (a, b) { return a - b; });
        var medianX = xs.length ? xs[Math.floor(xs.length / 2)] : 5;
        var splitY = (DATA.quadrant || {}).globalAvgPop || 42.48;
        var groups = { star: [], craft: [], volume: [], tail: [] };
        var maxSize = 1;

        raw.forEach(function (p) {
            maxSize = Math.max(maxSize, p.size);
            var many = p.x >= medianX;
            var hot = p.y >= splitY;
            groups[many ? (hot ? 'star' : 'volume') : (hot ? 'craft' : 'tail')]
                .push([p.x, p.y, p.name, p.size, p.album, p.dur]);
        });

        /* 气泡大小：专辑数用平方根压一下长尾（31 张和 1 张差 31 倍，直接线性会糊），
           平均时长本身量级很窄（1.6~5.9 分），用 (v-min)/(max-min) 拉开差异才看得出 */
        var sizes = raw.map(function (p) { return p.size; });
        var minS = Math.min.apply(null, sizes.concat([1]));
        var maxS = Math.max.apply(null, sizes.concat([1]));
        var spanS = Math.max(maxS - minS, 0.0001);

        function bubbleR(v) {
            if (isDur) {
                return 5 + ((v - minS) / spanS) * 17;
            }
            return 4 + Math.sqrt((v || 1) / Math.max(maxSize, 1)) * 18;
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
                symbolSize: function (val) {
                    return bubbleR(val[3]);
                },
                itemStyle: { color: def.color, opacity: def.key === 'tail' ? 0.5 : 0.8 },
                emphasis: {
                    scale: 1.35,
                    itemStyle: {
                        opacity: 1, borderColor: '#fff', borderWidth: 1,
                        shadowBlur: 12, shadowColor: 'rgba(34,211,238,0.9)'
                    }
                },
                data: groups[def.key]
            };
            if (idx === 0) {
                s.markLine = {
                    silent: true, symbol: 'none',
                    lineStyle: { color: C.accentDim, type: 'dashed', width: 1 },
                    label: {
                        color: C.textSub, fontSize: 10,
                        backgroundColor: 'rgba(8,17,30,0.75)', padding: [2, 4]
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
                        [{ xAxis: 3, yAxis: splitY, itemStyle: { color: 'rgba(167,139,250,0.13)' } },
                         { xAxis: medianX, yAxis: 100 }],
                        [{ xAxis: medianX, yAxis: splitY, itemStyle: { color: 'rgba(34,211,238,0.15)' } },
                         { xAxis: 999, yAxis: 100 }],
                        [{ xAxis: 3, yAxis: 0, itemStyle: { color: 'rgba(148,163,184,0.09)' } },
                         { xAxis: medianX, yAxis: splitY }],
                        [{ xAxis: medianX, yAxis: 0, itemStyle: { color: 'rgba(251,191,36,0.10)' } },
                         { xAxis: 999, yAxis: splitY }]
                    ]
                };
            }
            return s;
        });

        return {
            grid: { left: 52, right: 22, top: 34, bottom: 40 },
            animationDuration: 900,
            animationEasing: 'cubicOut',
            progressive: 1200,
            progressiveThreshold: 800,
            legend: {
                right: 10, top: 2, itemWidth: 9, itemHeight: 9, itemGap: 14,
                textStyle: { color: C.textSub, fontSize: 11 }
            },
            tooltip: Object.assign({
                trigger: 'item',
                formatter: function (p) {
                    var s = '<b>' + esc(p.data[2]) + '</b><br/>' +
                        '作品数 <b style="color:' + C.accent + '">' + p.data[0] + '</b> 首<br/>' +
                        '平均热度 <b style="color:' + C.warm + '">' + p.data[1].toFixed(2) + '</b><br/>' +
                        '专辑数 <b style="color:' + C.purple + '">' + p.data[4] + '</b> 张<br/>' +
                        '平均时长 <b style="color:' + C.green + '">' + p.data[5].toFixed(2) + '</b> 分';
                    s += '<br/><span style="color:' + C.textSub + '">气泡大小 = ' +
                        (isDur ? '平均时长' : '专辑数') + '</span>';
                    return s;
                }
            }, tip()),
            xAxis: {
                type: 'log', min: 3, max: 200,
                name: '作品数（对数轴）', nameLocation: 'middle', nameGap: 26,
                nameTextStyle: { color: C.textSub, fontSize: 11 },
                axisLine: { lineStyle: { color: C.axis } }, axisTick: { show: false },
                axisLabel: AXIS_TEXT, splitLine: { show: false }
            },
            yAxis: {
                type: 'value', min: 0, max: 100, name: '平均热度',
                nameTextStyle: { color: C.textSub, fontSize: 11, padding: [0, 0, 0, -14] },
                axisLine: { show: false }, axisTick: { show: false },
                axisLabel: AXIS_TEXT, splitLine: SPLIT
            },
            series: series
        };
    }

    /** 饼图 / 环形图 / 玫瑰图：三者只差半径与 roseType */
    function buildPie(data, measure, type) {
        var vals = data.series[measure] || [];
        var cats = data.categories || [];

        // 扇区太多（比如 62 个年份）饼图就失去意义了：取最大的 12 项，其余并成「其它」
        var MAX_SLICE = 12;
        var rows;
        if (cats.length > MAX_SLICE) {
            var pairs = cats.map(function (c, i) {
                return { name: c, value: vals[i] || 0 };
            }).sort(function (a, b) { return b.value - a.value; });
            var head = pairs.slice(0, MAX_SLICE);
            var restSum = pairs.slice(MAX_SLICE).reduce(function (t, x) { return t + x.value; }, 0);
            if (restSum > 0) {
                head.push({ name: '其它 ' + (pairs.length - MAX_SLICE) + ' 项', value: restSum });
            }
            rows = head;
        } else {
            rows = cats.map(function (c, i) {
                return { name: c, value: vals[i] || 0 };
            });
        }

        var radius = ['46%', '70%'];
        var roseType = false;
        if (type === 'ring') {
            radius = ['52%', '74%'];
        } else if (type === 'rose') {
            radius = ['18%', '72%'];
            roseType = 'radius';
        }

        return {
            color: SERIES,
            tooltip: Object.assign({
                trigger: 'item',
                formatter: '{b}<br/>' + MEASURE_LABEL[measure] + '：{c}（{d}%）'
            }, tip()),
            legend: {
                orient: 'vertical', right: 8, top: 'center',
                textStyle: { color: C.textSub, fontSize: 11 },
                itemWidth: 9, itemHeight: 9
            },
            series: [{
                type: 'pie',
                roseType: roseType,
                radius: radius,
                center: ['40%', '54%'],
                label: {
                    color: '#DCE7F5',
                    fontSize: 11,
                    formatter: type === 'rose' ? '{b}\n{c}' : '{b}\n{d}%'
                },
                labelLine: { lineStyle: { color: 'rgba(148,163,184,0.4)' } },
                itemStyle: { borderColor: '#0B1120', borderWidth: 2 },
                data: rows
            }]
        };
    }

    /** 折线 / 面积：面积图就是折线图加一层渐变填充 */
    function buildLine(data, measure, area) {
        var vals = data.series[measure] || [];
        var series = {
            type: 'line',
            smooth: true,
            symbol: 'none',
            lineStyle: {
                width: 2.5, color: C.accent,
                shadowColor: 'rgba(34,211,238,0.6)', shadowBlur: 12
            },
            data: vals
        };

        if (area) {
            series.areaStyle = {
                color: grad(0, 0, 0, 1, 'rgba(34,211,238,0.42)', 'rgba(34,211,238,0.02)')
            };
        }

        return {
            grid: { left: 54, right: 24, top: 30, bottom: 34 },
            tooltip: Object.assign({
                trigger: 'axis',
                formatter: function (p) {
                    return p[0].name + '<br/>' + MEASURE_LABEL[measure] +
                        '：<b style="color:' + C.accent + '">' + p[0].value +
                        (MEASURE_UNIT[measure] || '') + '</b>';
                }
            }, tip()),
            xAxis: {
                type: 'category', data: data.categories, boundaryGap: area,
                axisLine: { lineStyle: { color: C.axis } },
                axisTick: { show: false },
                axisLabel: Object.assign({}, AXIS_TEXT, {
                    interval: 'auto',
                    rotate: (data.categories || []).length > 20 ? 0 : 0
                })
            },
            yAxis: {
                type: 'value', splitLine: SPLIT,
                axisLine: { show: false }, axisTick: { show: false },
                axisLabel: AXIS_TEXT
            },
            series: [series]
        };
    }

    /** 柱状 / 横向条形 */
    function buildBar(data, measure, horizontal) {
        var vals = data.series[measure] || [];
        var cats = data.categories || [];
        var maxV = Math.max.apply(null, vals.concat([1]));
        var unit = MEASURE_UNIT[measure] || '';

        var axisCat = {
            type: 'category', data: cats,
            axisLine: { lineStyle: { color: C.axis } }, axisTick: { show: false },
            axisLabel: Object.assign({}, AXIS_TEXT, {
                fontSize: 10,
                width: horizontal ? 100 : 60,
                overflow: 'truncate',
                interval: 0
            })
        };
        var axisVal = {
            type: 'value', splitLine: SPLIT,
            axisLine: { show: false }, axisTick: { show: false },
            axisLabel: AXIS_TEXT
        };

        return {
            grid: {
                left: horizontal ? 112 : 48,
                right: horizontal ? 56 : 30,
                top: 22,
                bottom: horizontal ? 24 : 34
            },
            tooltip: Object.assign({
                trigger: 'axis',
                axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(34,211,238,0.06)' } },
                formatter: function (p) {
                    return p[0].name + '<br/>' + MEASURE_LABEL[measure] +
                        '：<b style="color:' + C.accent + '">' + p[0].value + unit + '</b>';
                }
            }, tip()),
            xAxis: horizontal ? axisVal : axisCat,
            yAxis: horizontal ? Object.assign({}, axisCat, { inverse: true }) : axisVal,
            series: [{
                type: 'bar',
                barWidth: horizontal ? '58%' : '46%',
                data: vals.map(function (v) {
                    var ratio = v / maxV;
                    return {
                        value: v,
                        itemStyle: {
                            borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
                            color: horizontal
                                ? grad(0, 0, 1, 0, 'rgba(34,211,238,0.30)', ratio > 0.7 ? C.warm : C.accent)
                                : grad(0, 1, 0, 0, 'rgba(34,211,238,0.12)', ratio > 0.7 ? C.warm : C.accent)
                        }
                    };
                }),
                label: {
                    show: true,
                    position: horizontal ? 'right' : 'top',
                    fontSize: 10,
                    fontFamily: 'Consolas, monospace',
                    color: '#9FB3C8',
                    formatter: function (p) { return num(p.value) + unit; }
                }
            }]
        };
    }

    /* ---------- 7.5 选择器事件 ---------- */

    function bindCustom() {
        function save() {
            try {
                localStorage.setItem(CUSTOM_STORE, JSON.stringify(CFG));
            } catch (e) { /* 隐私模式忽略 */ }
        }

        // 换维度：三个框全重铺（新维度支持什么、当前图表还能不能用，都要重算）
        document.getElementById('cfg-dim').addEventListener('change', function (e) {
            CFG.dim = e.target.value;
            normalizeCfg();
            syncSelectors();
            renderCustom();
            save();
        });

        // 换度量：只需重铺「图表」下拉，因为饼图这类图表会因度量而消失
        document.getElementById('cfg-measure').addEventListener('change', function (e) {
            CFG.measure = e.target.value;
            var types = typesFor(CFG.dim, CFG.measure);
            if (types.indexOf(CFG.type) < 0) {
                CFG.type = types[0];
            }
            syncSelectors();
            renderCustom();
            save();
        });

        // 换图表：只需重铺「度量」下拉，因为选了饼图后平均热度这类度量会消失
        document.getElementById('cfg-type').addEventListener('change', function (e) {
            CFG.type = e.target.value;
            var measures = measuresFor(CFG.dim, CFG.type);
            if (measures.indexOf(CFG.measure) < 0) {
                CFG.measure = measures[0];
            }
            syncSelectors();
            renderCustom();
            save();
        });
    }

    /* ==================================================================
     * 8. 专辑曲目数 × 歌曲平均热度（课程要求的第 4 张图）
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
     * 10. 合并面板：关注歌手 / 收藏歌曲
     *     一个搜索框 + 一个备注框 + 一个动作按钮，切换模式时只换文案和接口：
     *       · 按歌手搜索 → 写 artist_favorite（关注歌手）
     *       · 按歌曲搜索 → 写 song_tag（收藏歌曲 / 打标签）
     *     两种模式共用同一套排版：上面是搜索结果，下面是已收藏列表。
     * ================================================================== */
    var MODE = 'artist';      // 'artist' 关注歌手 | 'song' 收藏歌曲
    var saved = [];           // 当前模式的已收藏数据
    var picked = null;        // 歌曲模式下从搜索结果里点中的那首歌 {trackId, songName}
    var searchTimer = null;   // 输入防抖

    var TEXT = {
        artist: {
            title: '关注歌手',
            searchPlaceholder: '歌手名，如 Billie Eilish（不区分大小写）',
            notePlaceholder: '备注（可空）',
            action: '关注',
            emptyHint: '输入歌手名开始搜索',
            savedEmpty: '还没有关注任何歌手'
        },
        song: {
            title: '收藏歌曲',
            searchPlaceholder: '歌名，如 11 PM（只匹配歌名）',
            notePlaceholder: '标签（可空）',
            action: '收藏',
            emptyHint: '输入歌名开始搜索',
            savedEmpty: '还没有收藏任何歌曲'
        }
    };

    /* ---------- 10.1 模式切换 ---------- */

    function setMode(mode) {
        MODE = mode;
        var t = TEXT[mode];
        picked = null;

        var btns = document.querySelectorAll('#mode-switch .mode-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === mode);
        }

        document.getElementById('search-title').textContent = t.title;
        document.getElementById('q-input').placeholder = t.searchPlaceholder;
        document.getElementById('note-input').placeholder = t.notePlaceholder;
        document.getElementById('save-btn').textContent = t.action;
        document.getElementById('q-input').value = '';
        document.getElementById('note-input').value = '';
        closeOverlay();          // 结果浮层：没内容时不占地方

        loadSaved();
    }

    function refreshCountLabel() {
        document.getElementById('search-count').textContent = saved.length + ' 条';
    }

    /* ---------- 10.2 搜索：两种模式走不同接口 ---------- */

    function doSearch(keyword) {
        if (!keyword) {
            return;
        }
        if (MODE === 'artist') {
            getJSON('/api/artist/search?q=' + encodeURIComponent(keyword) + '&limit=30')
                .then(renderArtistResults)
                .catch(function (e) { toast(e.message, true); });
        } else {
            getJSON('/api/song/search?q=' + encodeURIComponent(keyword) + '&limit=30')
                .then(renderSongResults)
                .catch(function (e) { toast(e.message, true); });
        }
    }

    /** 结果浮层：有内容才弹出来，盖在收藏列表上面，不推挤下面的内容 */
    function openOverlay(html) {
        var box = document.getElementById('result-list');
        box.innerHTML = html;
        box.classList.add('open');
    }

    function closeOverlay() {
        document.getElementById('result-list').classList.remove('open');
    }

    /** 歌手候选：点一下把名字填进输入框 */
    function renderArtistResults(rows) {
        if (!rows || !rows.length) {
            openOverlay('<div class="empty">库里没有匹配的歌手，也是可以直接点「关注」把名字存下来的</div>');
            return;
        }

        openOverlay(rows.map(function (a, i) {
            return '<div class="pick-item" data-name="' + esc(a.name) + '">' +
                '<span class="rk">' + (i + 1) + '</span>' +
                '<span class="song" title="' + esc(a.name) + '">' + esc(a.name) + '</span>' +
                '<span class="artist">' + a.works + ' 首</span>' +
                '<span class="pop">' + a.avgPop.toFixed(1) + '</span></div>';
        }).join(''));
    }

    /** 歌曲候选：点一下把歌名填进输入框，并把 trackId 记下来 */
    function renderSongResults(rows) {
        if (!rows || !rows.length) {
            openOverlay('<div class="empty">库里没有这首歌，也是可以直接点「收藏」把歌名存下来的</div>');
            return;
        }

        openOverlay(rows.map(function (s, i) {
            return '<div class="pick-item" data-track="' + esc(s.trackId) + '" data-name="' + esc(s.trackName) +
                '" data-artist="' + esc(s.artist) + '">' +
                '<span class="rk">' + (i + 1) + '</span>' +
                '<span class="song" title="' + esc(s.trackName) + '">' + esc(s.trackName) + '</span>' +
                '<span class="artist" title="' + esc(s.artist) + '">' + esc(s.artist) + '</span>' +
                '<span class="pop">' + s.popularity + '</span></div>';
        }).join(''));

        // 把当前选中项高亮回来（列表内容保持不变，只是标一下选中状态）
        if (picked) {
            var nodes = document.querySelectorAll('#result-list .pick-item');
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].classList.toggle('active', nodes[i].getAttribute('data-track') === picked.trackId);
            }
        }
    }

    /* ---------- 10.3 已收藏列表（两种模式共用一套排版） ---------- */

    function loadSaved() {
        var url = (MODE === 'artist') ? '/api/favorite' : '/api/tag/list?limit=30';
        return getJSON(url).then(function (rows) {
            saved = rows || [];
            renderSaved();
            refreshCountLabel();
            refreshCounters();
        });
    }

    function renderSaved() {
        var box = document.getElementById('saved-list');
        var t = TEXT[MODE];

        if (!saved.length) {
            box.innerHTML = '<div class="empty">' + t.savedEmpty + '</div>';
            return;
        }

        box.innerHTML = saved.map(function (r) {
            var isArtist = (MODE === 'artist');
            var name = isArtist ? r.artistName : (r.songName || r.trackId);
            var note = isArtist ? (r.note || '') : (r.tagName || '');
            // 库里没有的条目打「库外」标：说明它只是名字，图表里找不到对应数据
            var flag = r.inDataset
                ? '<span class="tag-in">库内</span>'
                : '<span class="tag-out">库外</span>';
            return '<div class="item" data-id="' + r.id + '" data-note="' + esc(note) + '">' +
                '<span class="name" title="' + esc(name) + '">' + esc(name) + '</span>' +
                flag +
                '<span class="note" title="' + esc(note) + '">' + esc(note) + '</span>' +
                '<span class="time">' + esc((r.createdAt || '').slice(5, 16)) + '</span>' +
                '<span class="ops">' +
                '<button class="ghost mini" data-act="edit">' + (isArtist ? '备注' : '改标签') + '</button>' +
                '<button class="danger" data-act="del">删除</button>' +
                '</span></div>';
        }).join('');
    }

    /* ---------- 10.4 保存（关注 / 收藏） ---------- */

    function saveItem() {
        var nameInput = document.getElementById('q-input');
        var noteInput = document.getElementById('note-input');
        var name = nameInput.value.trim();

        if (!name) {
            toast(MODE === 'artist' ? '先填写或选择歌手名' : '先填写或选择歌名', true);
            nameInput.focus();
            return;
        }

        if (MODE === 'artist') {
            postJSON('/api/favorite', { artistName: name, note: noteInput.value.trim() })
                .then(function (r) {
                    noteInput.value = '';
                    toast(r.inDataset ? ('已关注 ' + name + '（库内）')
                                      : ('已关注 ' + name + '（库外，数据集中没有这位歌手）'));
                    return loadSaved();
                })
                .catch(function (e) { toast(e.message, true); });
            return;
        }

        // 歌曲模式：从搜索结果点过就用真实 trackId；手输的歌名则交给服务端生成 custom: 占位 id
        var fromPick = picked && picked.songName === name;
        postJSON('/api/tag', {
            trackId: fromPick ? picked.trackId : '',
            songName: name,
            tagName: noteInput.value.trim()
        }).then(function (r) {
            noteInput.value = '';
            toast(r.inDataset ? ('已收藏《' + name + '》')
                              : ('已收藏《' + name + '》（库外，数据集中没有这首歌）'));
            picked = null;
            return loadSaved();
        }).catch(function (e) { toast(e.message, true); });
    }

    /* ---------- 10.5 列表里的「备注 / 改标签」与删除 ---------- */

    function editItem(item) {
        var noteEl = item.querySelector('.note');
        var ops = item.querySelector('.ops');
        var cur = item.getAttribute('data-note') || '';

        noteEl.innerHTML = '<input type="text" maxlength="64" value="' + esc(cur) +
            '" style="height:22px;font-size:11px;width:100%">';
        ops.innerHTML = '<button class="ghost mini" data-act="save">保存</button>' +
            '<button class="danger" data-act="cancel">取消</button>';

        var input = noteEl.querySelector('input');
        input.focus();
        input.select();
    }

    function saveItemEdit(item, id) {
        var input = item.querySelector('.note input');
        var value = input ? input.value.trim() : '';

        var req = (MODE === 'artist')
            ? postJSON('/api/favorite/' + id, { note: value }, 'PUT')
            : postJSON('/api/tag/' + id, { tagName: value }, 'PUT');

        req.then(function () {
            toast(MODE === 'artist' ? '备注已更新' : '标签已更新');
            return loadSaved();
        }).catch(function (e) { toast(e.message, true); });
    }

    function deleteItem(id) {
        var url = (MODE === 'artist') ? '/api/favorite/' + id : '/api/tag/' + id;
        getJSON(url, { method: 'DELETE' })
            .then(function () {
                toast(MODE === 'artist' ? '已取消关注' : '已取消收藏');
                return loadSaved();
            })
            .catch(function (e) { toast(e.message, true); });
    }

    /* ---------- 10.6 事件绑定 ---------- */

    function bindPanel() {
        var q = document.getElementById('q-input');
        var note = document.getElementById('note-input');

        // 搜索：输入防抖 320ms，回车/按钮立即搜
        q.addEventListener('input', function () {
            // 用户手动改了名字 → 之前选中的那首歌作废（否则会拿旧 trackId 存新名字）
            if (picked && q.value.trim() !== picked.songName) {
                picked = null;
            }
            clearTimeout(searchTimer);
            var kw = q.value.trim();
            if (!kw) {
                closeOverlay();          // 清空就收起浮层
                return;
            }
            searchTimer = setTimeout(function () { doSearch(kw); }, 320);
        });

        q.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                doSearch(q.value.trim());
            }
        });

        note.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                saveItem();
            }
        });

        document.getElementById('q-btn-search').addEventListener('click', function () {
            doSearch(q.value.trim());
        });
        document.getElementById('save-btn').addEventListener('click', saveItem);

        // 点搜索结果：只把名字填进输入框，搜索结果列表保持不变（不重新搜）
        document.getElementById('result-list').addEventListener('click', function (e) {
            var row = e.target.closest('.pick-item');
            if (!row) {
                return;
            }
            var name = row.getAttribute('data-name');
            q.value = name;
            closeOverlay();              // 名字已填进输入框，浮层可以收了
            if (MODE === 'song') {
                picked = { trackId: row.getAttribute('data-track'), songName: name };
                var nodes = document.querySelectorAll('#result-list .pick-item');
                for (var i = 0; i < nodes.length; i++) {
                    nodes[i].classList.toggle('active', nodes[i] === row);
                }
                note.focus();
            } else {
                picked = null;
                note.focus();
            }
        });

        // 已收藏列表：改备注/改标签、保存、取消、删除
        document.getElementById('saved-list').addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-act]');
            if (!btn) {
                return;
            }
            var item = btn.closest('.item');
            var id = item.getAttribute('data-id');
            var act = btn.getAttribute('data-act');

            if (act === 'del') {
                deleteItem(id);
            } else if (act === 'edit') {
                editItem(item);
            } else if (act === 'save') {
                saveItemEdit(item, id);
            } else if (act === 'cancel') {
                loadSaved();
            }
        });

        // 模式切换：点击直接切
        document.getElementById('mode-switch').addEventListener('click', function (e) {
            var btn = e.target.closest('.mode-btn');
            if (btn) {
                setMode(btn.getAttribute('data-mode'));
            }
        });
    }

    /* ---------- 10.7 顶部 KPI 的两个计数 ---------- */

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

        /* 从后台切回来时补一次 KPI：后台期间 rAF 停摆，滚动动画不会跑 */
        document.addEventListener('visibilitychange', function () {
            if (document.hidden || !DATA.overview) {
                return;
            }
            renderKPI(DATA.overview);
        });

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
            // 原始数据统一存进 DATA：固定那几张图用它，可配置图表也复用它
            DATA.overview = res[0];
            DATA.yearTrend = res[1];
            DATA.distribution = res[2];
            DATA.topArtists = res[3];
            DATA.spans = res[4];
            DATA.quadrant = res[5];
            DATA.albumBins = res[6];
            DATA.scatter = res[7];

            renderKPI(res[0]);
            renderTrend(res[1]);
            renderDistribution(res[2]);
            renderTop(res[3]);
            renderSpan(res[4]);
            renderAlbum(res[6]);
            renderScatter(res[7]);

            // 可配置图表：先把选择器按兼容性矩阵铺好，再按当前配置画一次
            normalizeCfg();
            syncSelectors();
            renderCustom();
        }).catch(function (e) {
            toast('数据加载失败：' + e.message, true);
            console.error(e);
        });

        bindPanel();       // 搜索面板：搜索框 / 备注 / 按钮 / 两个列表 / 模式切换
        bindCustom();      // 可配置图表：维度 / 度量 / 图形 三个选择器

        setMode('artist');   // 默认「按歌手搜索」，不记忆上次选择（setMode 内部会拉列表）
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
