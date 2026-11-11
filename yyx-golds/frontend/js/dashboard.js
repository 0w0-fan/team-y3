/* 大屏前端。五个图都靠 /api/genre/* 这几个接口喂数据，
   只有「关注列表」会写库（genre_watch），分析主表是只读的。 */
(function () {
    'use strict';

    var GENRES = ['pop', 'rap', 'rock', 'latin', 'r&b', 'edm'];
    var COLORS = {
        pop: '#22D3EE',
        rap: '#A78BFA',
        rock: '#F87171',
        latin: '#FBBF24',
        'r&b': '#34D399',
        edm: '#60A5FA'
    };
    // 雷达轴上的短标签，tooltip 里还是显示英文字段名
    var AXIS_CN = {
        danceability: '律动',
        energy: '能量',
        speechiness: '说唱感',
        acousticness: '原声度',
        instrumentalness: '器乐感',
        liveness: '现场感',
        valence: '愉悦度'
    };

    var summaryData, trendData, rankData, allRankData, radarData, binData;
    var picked = null;          // 当前联动选中的流派，null 表示没选
    var mode = 'count';         // 趋势图的两种口径：count / share
    var watchList = [];
    var editingId = null;
    var K = 1;                  // 字号/间距的缩放系数，跟视口大小走

    var hero, rankChart, trendChart, radarChart, binChart;

    function $(id) {
        return document.getElementById(id);
    }

    function alpha(hex, a) {
        var s = hex.substring(1);
        var r = parseInt(s.substr(0, 2), 16);
        var g = parseInt(s.substr(2, 2), 16);
        var b = parseInt(s.substr(4, 2), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function num(n) {
        return (n === null || n === undefined) ? '—' : Number(n).toLocaleString('en-US');
    }

    function colorOf(g) {
        return COLORS[g] || '#94A3B8';
    }

    function get(url) {
        return fetch(url).then(function (res) {
            if (!res.ok) {
                throw new Error(url + ' 返回 ' + res.status);
            }
            return res.json();
        });
    }

    function send(url, method, body) {
        var opt = { method: method, headers: { 'Content-Type': 'application/json;charset=UTF-8' } };
        if (body) {
            opt.body = JSON.stringify(body);
        }
        return fetch(url, opt).then(function (res) {
            return res.text().then(function (txt) {
                var data = null;
                try {
                    data = txt ? JSON.parse(txt) : null;
                } catch (e) {
                    // 后端抛异常时可能不是 JSON，下面按状态码处理
                }
                if (!res.ok) {
                    throw new Error((data && data.message) || ('HTTP ' + res.status));
                }
                return data;
            });
        });
    }

    var toastTimer;

    function tip(msg, bad) {
        var box = $('toast');
        box.textContent = msg;
        box.className = bad ? 'toast err' : 'toast';
        box.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { box.hidden = true; }, 2400);
    }

    // 深色 tooltip 的基础样式，各图再补 formatter
    function tipBase() {
        return {
            backgroundColor: 'rgba(9,15,28,0.95)',
            borderColor: 'rgba(148,163,184,0.25)',
            borderWidth: 1,
            padding: [7, 11],
            textStyle: { color: '#E2E8F0', fontSize: 12 }
        };
    }

    /* ---------------- 主图：供给量 vs 平均热度 ---------------- */

    function drawHero() {
        var rows = summaryData.genres;
        var names = [];
        var byGenre = {};
        var i;
        for (i = 0; i < rows.length; i++) {
            names.push(rows[i].genre);
            byGenre[rows[i].genre] = rows[i];
        }

        var popSum = 0, cntSum = 0;
        for (i = 0; i < rows.length; i++) {
            popSum += rows[i].avgPopularity * rows[i].songCount;
            cntSum += rows[i].songCount;
        }
        var avgAll = cntSum ? popSum / cntSum : 0;
        $('subGlobal').textContent = avgAll.toFixed(2);
        $('tagGlobal').innerHTML = '全局均值 <em>' + avgAll.toFixed(2) + '</em>';

        // 轴上的流派名跟着流派色走，方便和柱子对上
        var rich = {};
        for (i = 0; i < names.length; i++) {
            rich['g' + i] = {
                color: (picked && picked !== names[i]) ? '#475569' : COLORS[names[i]],
                fontSize: 16,
                fontWeight: 'bold',
                fontFamily: 'Consolas, "Courier New", monospace'
            };
        }

        var bars = [];
        var line = [];
        for (i = 0; i < rows.length; i++) {
            var r = rows[i];
            var off = picked && picked !== r.genre;
            bars.push({
                value: r.songCount,
                itemStyle: {
                    color: off ? alpha(colorOf(r.genre), 0.16)
                        : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: alpha(colorOf(r.genre), 0.9) },
                            { offset: 1, color: alpha(colorOf(r.genre), 0.12) }
                        ])
                }
            });
            line.push(r.avgPopularity);
        }

        hero.setOption(scaled({
            animationDuration: 650,
            animationDurationUpdate: 220,
            grid: { left: 68, right: 76, top: 44, bottom: 34 },
            tooltip: {
                backgroundColor: tipBase().backgroundColor,
                borderColor: tipBase().borderColor,
                borderWidth: 1,
                padding: [7, 11],
                textStyle: tipBase().textStyle,
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function (ps) {
                    var d = byGenre[ps[0].axisValue];
                    if (!d) {
                        return '';
                    }
                    return d.genre.toUpperCase() +
                        '<br/>歌曲数 ' + num(d.songCount) + ' 首（' + d.share + '%）' +
                        '<br/>平均热度 ' + d.avgPopularity +
                        '<br/>中位热度 ' + d.medianPopularity;
                }
            },
            xAxis: {
                type: 'category',
                data: names,
                axisTick: { show: false },
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.22)' } },
                axisLabel: {
                    interval: 0,
                    margin: 11,
                    formatter: function (v, idx) {
                        return '{g' + idx + '|' + v.toUpperCase() + '}';
                    },
                    rich: rich
                }
            },
            yAxis: [
                {
                    type: 'value',
                    name: '歌曲数',
                    nameTextStyle: { color: '#64748B', fontSize: 10, padding: [0, 0, 6, 12] },
                    axisLabel: { color: '#94A3B8', fontSize: 11 },
                    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
                    axisLine: { show: false },
                    axisTick: { show: false }
                },
                {
                    type: 'value',
                    name: '平均热度',
                    min: 0,
                    max: 60,
                    nameTextStyle: { color: '#8a6d1f', fontSize: 10 },
                    axisLabel: { color: '#C8A03F', fontSize: 11 },
                    splitLine: { show: false },
                    axisLine: { show: false },
                    axisTick: { show: false }
                }
            ],
            series: [
                {
                    name: '歌曲数',
                    type: 'bar',
                    barWidth: '36%',
                    data: bars,
                    label: {
                        show: true,
                        position: 'top',
                        distance: 7,
                        color: '#9fb0c6',
                        fontSize: 12,
                        formatter: function (p) { return num(p.value); }
                    }
                },
                {
                    name: '平均热度',
                    type: 'line',
                    yAxisIndex: 1,
                    data: line,
                    smooth: 0.25,
                    symbol: 'circle',
                    symbolSize: 10,
                    itemStyle: { color: '#FBBF24', borderColor: '#0B1120', borderWidth: 2 },
                    lineStyle: { width: 2.6, color: '#FBBF24' },
                    label: {
                        show: true,
                        position: 'bottom',
                        distance: 8,
                        color: '#E0B84C',
                        fontSize: 12,
                        formatter: function (p) { return p.value.toFixed(2); }
                    },
                    // 一条基准线，讲“谁在均值以上”时比看数字快；数值标题里已经写了，线本身不再标字
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        lineStyle: { color: 'rgba(226,184,76,0.5)', type: 'dashed', width: 1 },
                        label: { show: false },
                        data: [{ yAxis: avgAll }]
                    }
                }
            ]
        }), true);

        hero.off('click');
        hero.on('click', function (p) {
            if (p.name && COLORS[p.name]) {
                pick(p.name);
            }
        });
    }

    function fillStats() {
        var rows = summaryData.genres;
        var bySupply = rows.slice().sort(function (a, b) { return b.songCount - a.songCount; });
        var byHeat = rows.slice().sort(function (a, b) { return b.avgPopularity - a.avgPopularity; });
        var top = bySupply[0];
        var hot = byHeat[0];
        var cold = byHeat[byHeat.length - 1];

        var supplyRank = 1;
        var heatRank = 1;
        for (var i = 0; i < byHeat.length; i++) {
            if (byHeat[i].genre === top.genre) {
                heatRank = i + 1;
            }
        }
        for (var j = 0; j < bySupply.length; j++) {
            if (bySupply[j].genre === hot.genre) {
                supplyRank = j + 1;
            }
        }

        $('statSupply').setAttribute('data-genre', top.genre);
        $('statSupplyGenre').textContent = top.genre;
        $('statSupplyGenre').style.color = colorOf(top.genre);
        $('statSupplyCount').textContent = num(top.songCount) + ' 首';
        $('statSupplyNote').textContent = '占比 ' + top.share + '%，热度排第 ' + heatRank;

        $('statHeat').setAttribute('data-genre', hot.genre);
        $('statHeatGenre').textContent = hot.genre;
        $('statHeatGenre').style.color = colorOf(hot.genre);
        $('statHeatAvg').textContent = hot.avgPopularity.toFixed(2);
        $('statHeatNote').textContent = '供给排第 ' + supplyRank + '，' + num(hot.songCount) + ' 首';

        $('statGapValue').textContent = (hot.avgPopularity - cold.avgPopularity).toFixed(2);
        $('statGapNote').textContent = hot.genre + ' ' + hot.avgPopularity.toFixed(2) +
            '，' + cold.genre + ' ' + cold.avgPopularity.toFixed(2);

        ['statSupply', 'statHeat'].forEach(function (id) {
            var el = $(id);
            el.classList.toggle('on', el.getAttribute('data-genre') === picked);
        });
    }

    /* ---------------- 子流派 TOP15 ---------------- */

    function drawRank() {
        var items = rankData.items;
        var look = {};
        var src = allRankData ? allRankData.items : items;
        for (var i = 0; i < src.length; i++) {
            look[src[i].subgenre] = src[i];
        }

        // y 轴是从下往上排的，倒一下让第一名落在顶部
        var list = items.slice().reverse();
        var names = [];
        var data = [];
        for (var j = 0; j < list.length; j++) {
            names.push(list[j].subgenre);
            data.push({
                value: list[j].avgPopularity,
                itemStyle: {
                    color: (picked && picked !== list[j].genre)
                        ? 'rgba(100,116,139,0.35)' : colorOf(list[j].genre)
                }
            });
        }

        rankChart.setOption(scaled({
            animationDuration: 600,
            animationDurationUpdate: 200,
            grid: { left: 150, right: 58, top: 14, bottom: 20 },
            tooltip: {
                backgroundColor: tipBase().backgroundColor,
                borderColor: tipBase().borderColor,
                borderWidth: 1,
                padding: [7, 11],
                textStyle: tipBase().textStyle,
                trigger: 'item',
                formatter: function (p) {
                    var d = look[p.name];
                    if (!d) {
                        return p.name;
                    }
                    return d.subgenre + '<br/>' + d.genre +
                        ' · ' + num(d.songCount) + ' 首<br/>平均热度 ' + d.avgPopularity;
                }
            },
            xAxis: {
                type: 'value',
                max: 62,
                axisLabel: { color: '#94A3B8', fontSize: 10 },
                splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
                axisLine: { show: false },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'category',
                data: names,
                axisTick: { show: false },
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
                axisLabel: { color: '#C3CEDD', fontSize: 11, margin: 9 }
            },
            series: [{
                type: 'bar',
                barWidth: '56%',
                data: data,
                label: {
                    show: true,
                    position: 'right',
                    distance: 7,
                    color: '#B6C2D4',
                    fontSize: 11,
                    formatter: function (p) { return p.value.toFixed(2); }
                }
            }]
        }), true);

        rankChart.off('click');
        rankChart.on('click', function (p) {
            var d = look[p.name];
            if (d) {
                pick(d.genre);
            }
        });
    }

    /* ---------------- 年份趋势 ---------------- */

    function yearTotals() {
        var years = trendData.years.length;
        var totals = [];
        var i, s;
        for (i = 0; i < years; i++) {
            totals.push(0);
        }
        for (i = 0; i < trendData.series.length; i++) {
            s = trendData.series[i];
            for (var y = 0; y < years; y++) {
                totals[y] += s.values[y];
            }
        }
        return totals;
    }

    function drawTrend() {
        var totals = yearTotals();
        var asShare = mode === 'share';
        var series = [];

        for (var i = 0; i < trendData.series.length; i++) {
            var s = trendData.series[i];
            var off = picked && picked !== s.genre;
            var values = [];
            for (var y = 0; y < s.values.length; y++) {
                values.push(asShare
                    ? (totals[y] ? +(s.values[y] / totals[y] * 100).toFixed(2) : 0)
                    : s.values[y]);
            }
            series.push({
                name: s.genre,
                type: 'line',
                stack: 'all',
                smooth: 0.2,
                showSymbol: false,
                data: values,
                lineStyle: { width: off ? 0.8 : 1.3, color: colorOf(s.genre), opacity: off ? 0.2 : 1 },
                itemStyle: { color: colorOf(s.genre) },
                areaStyle: { color: alpha(colorOf(s.genre), off ? 0.04 : 0.4) }
            });
        }

        trendChart.setOption(scaled({
            animationDuration: 650,
            animationDurationUpdate: 200,
            grid: { left: 52, right: 20, top: 14, bottom: 42 },
            legend: {
                bottom: 6,
                left: 8,
                icon: 'circle',
                itemWidth: 8,
                itemHeight: 8,
                itemGap: 12,
                textStyle: { color: '#94A3B8', fontSize: 10 },
                inactiveColor: '#334155'
            },
            tooltip: {
                backgroundColor: tipBase().backgroundColor,
                borderColor: tipBase().borderColor,
                borderWidth: 1,
                padding: [7, 11],
                textStyle: tipBase().textStyle,
                trigger: 'axis',
                axisPointer: { type: 'line', lineStyle: { color: 'rgba(148,163,184,0.35)', width: 1, type: 'dashed' } },
                formatter: function (ps) {
                    var year = Number(ps[0].axisValue);
                    var idx = trendData.years.indexOf(year);
                    var sum = idx >= 0 ? totals[idx] : 0;
                    var out = year + ' 年，共 ' + num(sum) + ' 首';
                    ps.sort(function (a, b) { return b.value - a.value; });
                    for (var k = 0; k < ps.length; k++) {
                        out += '<br/>' + ps[k].marker + ps[k].seriesName + ' ' + ps[k].value +
                            (asShare ? '%' : '');
                    }
                    return out;
                }
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: trendData.years,
                axisTick: { show: false },
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
                axisLabel: { color: '#94A3B8', fontSize: 10, interval: 3 }
            },
            yAxis: {
                type: 'value',
                max: asShare ? 100 : null,
                name: asShare ? '占比 %' : '歌曲数',
                nameTextStyle: { color: '#64748B', fontSize: 10 },
                axisLabel: { color: '#94A3B8', fontSize: 10 },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } }
            },
            series: series
        }), true);
    }

    /* ---------------- 音频特征雷达 ---------------- */

    function drawRadar() {
        var byGenre = {};
        var i;
        for (i = 0; i < radarData.series.length; i++) {
            byGenre[radarData.series[i].genre] = radarData.series[i];
        }

        var indicators = [];
        for (i = 0; i < radarData.features.length; i++) {
            var f = radarData.features[i];
            indicators.push({ name: AXIS_CN[f] || f, max: radarData.max });
        }

        var data = [];
        for (i = 0; i < radarData.series.length; i++) {
            var s = radarData.series[i];
            var off = picked && picked !== s.genre;
            data.push({
                name: s.genre,
                value: s.values,
                lineStyle: { width: off ? 1 : 1.7, color: colorOf(s.genre), opacity: off ? 0.15 : 0.95 },
                itemStyle: { color: colorOf(s.genre) },
                areaStyle: { color: alpha(colorOf(s.genre), off ? 0.02 : 0.07) }
            });
        }

        radarChart.setOption(scaled({
            animationDuration: 750,
            animationDurationUpdate: 200,
            tooltip: {
                backgroundColor: tipBase().backgroundColor,
                borderColor: tipBase().borderColor,
                borderWidth: 1,
                padding: [7, 11],
                textStyle: tipBase().textStyle,
                trigger: 'item',
                formatter: function (p) {
                    var d = byGenre[p.name];
                    if (!d) {
                        return p.name;
                    }
                    var text = d.genre.toUpperCase();
                    for (var k = 0; k < radarData.features.length; k++) {
                        var key = radarData.features[k];
                        text += '<br/>' + (AXIS_CN[key] || key) + ' ' + d.values[k].toFixed(1) +
                            '（' + d.raw[key] + '）';
                    }
                    return text;
                }
            },
            radar: {
                center: ['50%', '53%'],
                radius: '62%',
                indicator: indicators,
                axisName: { color: '#8b98ab', fontSize: 10 },
                splitNumber: 4,
                splitLine: { lineStyle: { color: 'rgba(148,163,184,0.14)' } },
                splitArea: { show: false },
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.14)' } }
            },
            series: [{
                type: 'radar',
                symbol: 'none',
                emphasis: { lineStyle: { width: 2.2 } },
                data: data
            }]
        }), true);

        radarChart.off('click');
        radarChart.on('click', function (p) {
            if (p.name && COLORS[p.name]) {
                pick(p.name);
            }
        });
    }

    /* ---------------- 热度分箱 ---------------- */

    function drawBin() {
        var bins = binData.bins;
        var total = summaryData.total;
        var labels = [];
        var i;

        for (i = 0; i < bins.length; i++) {
            labels.push(bins[i].label);
        }

        var series = [];
        for (i = 0; i < GENRES.length; i++) {
            var g = GENRES[i];
            var off = picked && picked !== g;
            var values = [];
            for (var b = 0; b < bins.length; b++) {
                values.push(bins[b].shares[g]);
            }
            series.push({
                name: g,
                type: 'bar',
                stack: 'bins',
                barWidth: '46%',
                data: values,
                itemStyle: { color: off ? 'rgba(100,116,139,0.3)' : COLORS[g] }
            });
        }

        binChart.setOption(scaled({
            animationDuration: 600,
            animationDurationUpdate: 200,
            grid: { left: 42, right: 24, top: 12, bottom: 40 },
            legend: {
                bottom: 4,
                left: 'center',
                icon: 'rect',
                itemWidth: 8,
                itemHeight: 8,
                itemGap: 11,
                textStyle: { color: '#8b98ab', fontSize: 9.5 },
                inactiveColor: '#334155'
            },
            tooltip: {
                backgroundColor: tipBase().backgroundColor,
                borderColor: tipBase().borderColor,
                borderWidth: 1,
                padding: [7, 11],
                textStyle: tipBase().textStyle,
                trigger: 'item',
                formatter: function (p) {
                    var d = null;
                    for (var k = 0; k < bins.length; k++) {
                        if (bins[k].label === p.name) {
                            d = bins[k];
                        }
                    }
                    if (!d) {
                        return '';
                    }
                    return p.seriesName + ' 在 ' + d.label + ' 档<br/>' +
                        num(d.counts[p.seriesName]) + ' 首，占该档 ' + d.shares[p.seriesName] + '%<br/>' +
                        '该档合计 ' + num(d.total) + ' 首';
                }
            },
            xAxis: {
                type: 'category',
                data: labels,
                axisTick: { show: false },
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
                axisLabel: { color: '#C3CEDD', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                max: 100,
                axisLabel: { color: '#94A3B8', fontSize: 9.5, formatter: '{value}%' },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } }
            },
            series: series
        }), true);

        binChart.off('click');
        binChart.on('click', function (p) {
            if (p.seriesName) {
                pick(p.seriesName);
            }
        });

        for (i = 0; i < bins.length; i++) {
            if (bins[i].label === '81-100') {
                $('tagHighBin').innerHTML = '81-100 仅 <em>' + num(bins[i].total) + '</em> 首，' +
                    (bins[i].total / total * 100).toFixed(2) + '%';
            }
        }
    }

    /* ---------------- 联动 ---------------- */

    function pick(genre) {
        if (!COLORS[genre]) {
            return;
        }
        picked = (picked === genre) ? null : genre;
        applyPick();
    }

    // 五个图全部重画一遍，数据量很小，比逐个 patch option 省事也不卡
    function applyPick() {
        $('filterChip').hidden = !picked;
        if (picked) {
            $('filterGenre').textContent = picked.toUpperCase();
        }
        drawHero();
        fillStats();
        drawRank();
        drawTrend();
        drawRadar();
        drawBin();
    }

    /* ---------------- 取数 ---------------- */

    function loadAll() {
        Promise.all([
            get('/api/genre/summary'),
            get('/api/genre/trend?from=1990&to=2019'),
            get('/api/subgenre/rank?top=15'),
            get('/api/subgenre/rank?top=24'),
            get('/api/genre/radar'),
            get('/api/genre/bin')
        ]).then(function (res) {
            summaryData = res[0];
            trendData = res[1];
            rankData = res[2];
            allRankData = res[3];
            radarData = res[4];
            binData = res[5];

            drawHero();
            fillStats();
            drawRank();
            drawTrend();
            drawRadar();
            drawBin();

            $('footTotal').textContent = num(summaryData.total);
            $('footTime').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        }).catch(function (e) {
            tip('数据没取到：' + e.message, true);
            console.error(e);
        });
    }

    /* ---------------- 关注列表（唯一会写库的部分） ---------------- */

    function loadWatch() {
        get('/api/watch').then(function (data) {
            watchList = data.items || [];
            $('watchCount').textContent = data.total || 0;
            paintWatch();
        }).catch(function (e) {
            tip('关注列表读取失败：' + e.message, true);
        });
    }

    function paintWatch() {
        var body = $('watchBody');
        if (!watchList.length) {
            body.innerHTML = '<tr><td colspan="7" class="empty">还没有关注记录</td></tr>';
            return;
        }
        var html = '';
        for (var i = 0; i < watchList.length; i++) {
            var w = watchList[i];
            var dots = '';
            for (var d = 1; d <= 5; d++) {
                dots += d <= w.watchLevel ? '●' : '○';
            }
            html += '<tr>' +
                '<td>' + w.id + '</td>' +
                '<td><span class="g-badge" data-act="filter" data-genre="' + w.genre +
                '" style="cursor:pointer;color:' + colorOf(w.genre) +
                ';background:' + alpha(colorOf(w.genre), 0.13) + '">' + w.genre + '</span></td>' +
                '<td><span class="level-dots" title="等级 ' + w.watchLevel + '/5">' + dots + '</span></td>' +
                '<td class="note-cell" title="' + (w.note || '') + '">' +
                (w.note || '<span style="color:#475569">—</span>') + '</td>' +
                '<td style="color:#64748B">' + w.createdAt + '</td>' +
                '<td style="color:#64748B">' + w.updatedAt + '</td>' +
                '<td class="row-actions">' +
                '<button data-act="edit" data-id="' + w.id + '">改</button>' +
                '<button class="del" data-act="del" data-id="' + w.id + '">删</button>' +
                '</td></tr>';
        }
        body.innerHTML = html;
    }

    function resetForm() {
        editingId = null;
        $('wId').value = '';
        $('wGenre').value = 'pop';
        $('wLevel').value = '3';
        $('wNote').value = '';
        $('wSubmit').textContent = '新增';
    }

    function saveWatch(e) {
        e.preventDefault();
        var body = {
            genre: $('wGenre').value,
            watchLevel: Number($('wLevel').value),
            note: $('wNote').value
        };
        var req = editingId
            ? send('/api/watch/' + editingId, 'PUT', body)
            : send('/api/watch', 'POST', body);

        req.then(function () {
            tip(editingId ? '已保存 #' + editingId : '已新增一条');
            resetForm();
            loadWatch();
        }).catch(function (err) {
            tip(err.message, true);
        });
    }

    function onWatchClick(e) {
        var node = e.target;
        while (node && node !== this && !node.getAttribute('data-act')) {
            node = node.parentNode;
        }
        if (!node || node === this) {
            return;
        }
        var act = node.getAttribute('data-act');

        if (act === 'filter') {
            pick(node.getAttribute('data-genre'));
            return;
        }

        var id = Number(node.getAttribute('data-id'));

        if (act === 'edit') {
            for (var i = 0; i < watchList.length; i++) {
                if (watchList[i].id === id) {
                    editingId = id;
                    $('wId').value = id;
                    $('wGenre').value = watchList[i].genre;
                    $('wLevel').value = String(watchList[i].watchLevel);
                    $('wNote').value = watchList[i].note || '';
                    $('wSubmit').textContent = '保存';
                    $('wNote').focus();
                }
            }
        } else if (act === 'del') {
            // 第一次点改成“确认”，3 秒内再点才真删
            if (node.getAttribute('data-wait') === '1') {
                send('/api/watch/' + id, 'DELETE').then(function () {
                    tip('已删除 #' + id);
                    if (editingId === id) {
                        resetForm();
                    }
                    loadWatch();
                }).catch(function (err) {
                    tip(err.message, true);
                });
            } else {
                node.setAttribute('data-wait', '1');
                node.textContent = '确认？';
                setTimeout(function () {
                    node.removeAttribute('data-wait');
                    node.textContent = '删';
                }, 3000);
            }
        }
    }

    /* ---------------- 时钟、缩放 ---------------- */

    function clock() {
        var d = new Date();
        $('clockTime').textContent = d.toLocaleTimeString('zh-CN', { hour12: false });
        var week = '日一二三四五六'.charAt(d.getDay());
        $('clockDate').textContent = d.getFullYear() + '/' +
            ('0' + (d.getMonth() + 1)).slice(-2) + '/' +
            ('0' + d.getDate()).slice(-2) + ' 周' + week;
    }

    // 布局是流体铺满的，这里只算一个字号系数：1920×1080 时为 1，屏幕更大字也跟着大
    function tune() {
        var k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        k = Math.max(0.62, Math.min(2.1, k));
        if (Math.abs(k - K) < 0.02) {
            return false;
        }
        K = k;
        document.documentElement.style.setProperty('--k', String(k));
        return true;
    }

    // ECharts 的字号写死在 option 里，递归乘一遍系数；别的属性不碰
    function scaled(opt) {
        (function walk(o) {
            if (!o || typeof o !== 'object') {
                return;
            }
            for (var key in o) {
                if (key === 'fontSize' && typeof o[key] === 'number') {
                    o[key] = Math.round(o[key] * K * 10) / 10;
                } else {
                    walk(o[key]);
                }
            }
        })(opt);
        return opt;
    }

    function init() {
        hero = echarts.init($('chartSummary'));
        rankChart = echarts.init($('chartRank'));
        trendChart = echarts.init($('chartTrend'));
        radarChart = echarts.init($('chartRadar'));
        binChart = echarts.init($('chartBin'));

        tune();
        clock();
        setInterval(clock, 1000);

        var resizeTimer = null;
        window.addEventListener('resize', function () {
            var rescale = tune();
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                hero.resize();
                rankChart.resize();
                trendChart.resize();
                radarChart.resize();
                binChart.resize();
                // 系数变了必须重画：光 resize 画布不会重新计算字号
                if (rescale && summaryData) {
                    drawHero();
                    fillStats();
                    drawRank();
                    drawTrend();
                    drawRadar();
                    drawBin();
                }
            }, 120);
        });

        $('chipClear').onclick = function () {
            picked = null;
            applyPick();
        };

        Array.prototype.forEach.call(document.querySelectorAll('#trendMode .seg-btn'), function (btn) {
            btn.onclick = function () {
                var all = document.querySelectorAll('#trendMode .seg-btn');
                for (var i = 0; i < all.length; i++) {
                    all[i].classList.remove('active');
                }
                btn.classList.add('active');
                mode = btn.getAttribute('data-mode');
                if (trendData) {
                    drawTrend();
                }
            };
        });

        Array.prototype.forEach.call(document.querySelectorAll('.stat[data-genre]'), function (st) {
            st.onclick = function () {
                pick(st.getAttribute('data-genre'));
            };
        });

        $('btnWatch').onclick = function () {
            $('watchMask').hidden = false;
            loadWatch();
        };

        Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (btn) {
            btn.onclick = function () {
                $(btn.getAttribute('data-close')).hidden = true;
            };
        });

        Array.prototype.forEach.call(document.querySelectorAll('.modal-mask'), function (m) {
            m.onclick = function (e) {
                if (e.target === m) {
                    m.hidden = true;
                }
            };
        });

        document.onkeydown = function (e) {
            if (e.key === 'Escape') {
                $('watchMask').hidden = true;
                if (picked) {
                    picked = null;
                    applyPick();
                }
            }
        };

        $('watchForm').onsubmit = saveWatch;
        $('wReset').onclick = resetForm;
        $('watchBody').onclick = onWatchClick;

        loadAll();
        loadWatch();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
