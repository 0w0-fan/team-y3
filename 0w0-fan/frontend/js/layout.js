/* ============================================================================
 * 大屏布局引擎 · layout.js
 * ----------------------------------------------------------------------------
 * 负责三件事：
 *   1. 面板布局：绝对定位 + 拖动移动 + 八向缩放 + 8px 网格吸附 + 本地持久化
 *   2. 外观主题：底色、毛玻璃（backdrop-filter blur）、面板透明度、渐变（颜色/方向/强度）
 *   3. 顶部两个按钮：恢复默认（布局+外观）、自定义（设置抽屉）
 *
 * 设计约定：
 *   · 舞台仍是 1920×1080 设计稿，所有坐标都用设计稿像素，缩放由 CSS transform 统一处理，
 *     所以这里算出来的坐标在任何屏幕上都是同一套。
 *   · 拖动过程只改 transform（GPU 合成，不掉帧），松手时才把最终坐标写回 left/top。
 *   · 一切改动都存 localStorage，刷新后保持；「恢复默认」就是删掉这两份存储。
 * ========================================================================== */
(function () {
    'use strict';

    var STORE_LAYOUT = 'spotify-dash-layout-v1';
    var STORE_THEME = 'spotify-dash-theme-v1';
    var GRID = 8;          // 网格吸附步长（px）
    var MIN_W = 240;       // 面板最小宽
    var MIN_H = 150;       // 面板最小高

    var canvas = document.getElementById('canvas');
    if (!canvas) {
        return;
    }

    /* ------------------------------------------------------------------
     * 1. 默认布局（1920×1080 设计稿，画布区域高 962 = 1080-16*2-72-14）
     *    左列 3 张、中列 KPI + 可配置图表 + 两张、右列 2 张
     * ------------------------------------------------------------------ */
    var DEFAULT_LAYOUT = {
        'kpi-strip': { x: 532, y: 0, w: 856, h: 110 },
        'card-custom': { x: 532, y: 124, w: 856, h: 546 },   // 中间最大位：可配置图表
        'card-album': { x: 532, y: 684, w: 421, h: 278 },
        'card-scatter': { x: 967, y: 684, w: 421, h: 278 },
        'card-trend': { x: 16, y: 0, w: 502, h: 340 },
        'card-dist': { x: 16, y: 354, w: 502, h: 297 },
        'card-top': { x: 16, y: 665, w: 502, h: 297 },
        'card-span': { x: 1402, y: 0, w: 502, h: 474 },
        'card-search': { x: 1402, y: 488, w: 502, h: 474 }
    };

    var DEFAULT_THEME = {
        bg: '#070C16',      // 页面底色
        blur: 0,            // 面板毛玻璃程度（px）
        alpha: 92,          // 面板底色不透明度（%）
        c1: '#22D3EE',      // 渐变颜色 A
        c2: '#A78BFA',      // 渐变颜色 B
        mix: 30,            // 渐变强度（%）
        deg: 135,           // 渐变方向（度）
        hidden: []          // 被隐藏的面板 id
    };

    /* ------------------------------------------------------------------
     * 2. 读写 localStorage
     * ------------------------------------------------------------------ */

    function read(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* 隐私模式等场景写不进去，忽略即可，不影响当前会话 */ }
    }

    var layout = read(STORE_LAYOUT, null);
    var theme = read(STORE_THEME, null);

    if (!layout) {
        layout = {};
        for (var id in DEFAULT_LAYOUT) {
            if (Object.prototype.hasOwnProperty.call(DEFAULT_LAYOUT, id)) {
                layout[id] = {
                    x: DEFAULT_LAYOUT[id].x,
                    y: DEFAULT_LAYOUT[id].y,
                    w: DEFAULT_LAYOUT[id].w,
                    h: DEFAULT_LAYOUT[id].h
                };
            }
        }
    }
    if (!theme) {
        theme = {};
        for (var k in DEFAULT_THEME) {
            if (Object.prototype.hasOwnProperty.call(DEFAULT_THEME, k)) {
                theme[k] = DEFAULT_THEME[k];
            }
        }
    }

    /* ------------------------------------------------------------------
     * 3. 应用布局与外观
     * ------------------------------------------------------------------ */

    function panels() {
        return canvas.querySelectorAll('.panel');
    }

    function applyLayout() {
        var list = panels();
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            var id = el.id;
            var box = layout[id] || DEFAULT_LAYOUT[id];
            if (!box) {
                continue;
            }
            el.style.left = box.x + 'px';
            el.style.top = box.y + 'px';
            el.style.width = box.w + 'px';
            el.style.height = box.h + 'px';
            // 显示时清空内联 display，让样式表自己的 display（KPI 区是 grid、其它是 flex）生效
            el.style.display = theme.hidden.indexOf(id) >= 0 ? 'none' : '';
        }
        resizeCharts();
    }

    /** 面板尺寸变了以后，里面的 ECharts 需要重新计算画布尺寸 */
    function resizeCharts() {
        if (!window.echarts) {
            return;
        }
        var list = canvas.querySelectorAll('.chart');
        for (var i = 0; i < list.length; i++) {
            var inst = echarts.getInstanceByDom(list[i]);
            if (inst) {
                inst.resize();
            }
        }
    }

    function hex2rgba(hex, alpha) {
        var h = hex.replace('#', '');
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        var r = parseInt(h.substring(0, 2), 16);
        var g = parseInt(h.substring(2, 4), 16);
        var b = parseInt(h.substring(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function applyTheme() {
        document.body.style.background = theme.bg;

        var a = theme.alpha / 100;
        var m = theme.mix / 100;
        var list = panels();

        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            // 两层背景叠起来：上层是用户调的渐变（半透明），下层是面板本来的深色底
            el.style.background =
                'linear-gradient(' + theme.deg + 'deg, ' + hex2rgba(theme.c1, m) + ', ' + hex2rgba(theme.c2, m) + '),' +
                'linear-gradient(165deg, ' + hex2rgba('#0D192B', a) + ', ' + hex2rgba('#09111F', a) + ')';
            // 毛玻璃：需要背景半透明才看得出来，所以 alpha 越低效果越明显
            el.style.backdropFilter = theme.blur > 0 ? ('blur(' + theme.blur + 'px)') : '';
            el.style.webkitBackdropFilter = el.style.backdropFilter;
        }
    }

    /* ------------------------------------------------------------------
     * 4. 拖动移动（只改 transform，松手才落位）
     * ------------------------------------------------------------------ */

    function startDrag(el, ev) {
        // 标题栏里如果有下拉框/按钮，就别触发拖动
        if (ev.target.closest('select, input, button')) {
            return;
        }

        var box = layout[el.id];
        if (!box) {
            return;
        }

        var startX = ev.clientX;
        var startY = ev.clientY;
        var scale = currentScale();
        var moved = false;

        el.classList.add('dragging');
        document.body.classList.add('dragging');

        function onMove(e) {
            var dx = (e.clientX - startX) / scale;
            var dy = (e.clientY - startY) / scale;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                moved = true;
            }
            el.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
        }

        function onUp(e) {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            el.classList.remove('dragging');
            document.body.classList.remove('dragging');
            el.style.transform = '';

            if (!moved) {
                return;
            }

            var dx = (e.clientX - startX) / scale;
            var dy = (e.clientY - startY) / scale;
            box.x = snap(clamp(box.x + dx, -box.w + 120, 1920 - 120));
            box.y = snap(clamp(box.y + dy, -60, 962 - 60));
            applyLayout();
            saveLayout();
        }

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        ev.preventDefault();
    }

    /** 缩放：8 个手柄共用一套逻辑，用 handle 决定改哪条边 */
    function startResize(el, handle, ev) {
        var box = layout[el.id];
        if (!box) {
            return;
        }

        var startX = ev.clientX;
        var startY = ev.clientY;
        var scale = currentScale();
        var origin = { x: box.x, y: box.y, w: box.w, h: box.h };

        el.classList.add('resizing');
        document.body.classList.add('resizing');

        function onMove(e) {
            var dx = (e.clientX - startX) / scale;
            var dy = (e.clientY - startY) / scale;
            var w = origin.w;
            var h = origin.h;
            var x = origin.x;
            var y = origin.y;

            if (handle.indexOf('e') >= 0) {
                w = Math.max(MIN_W, origin.w + dx);
            }
            if (handle.indexOf('s') >= 0) {
                h = Math.max(MIN_H, origin.h + dy);
            }
            if (handle.indexOf('w') >= 0) {
                w = Math.max(MIN_W, origin.w - dx);
                x = origin.x + (origin.w - w);
            }
            if (handle.indexOf('n') >= 0) {
                h = Math.max(MIN_H, origin.h - dy);
                y = origin.y + (origin.h - h);
            }

            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.width = w + 'px';
            el.style.height = h + 'px';
        }

        function onUp() {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            el.classList.remove('resizing');
            document.body.classList.remove('resizing');

            box.w = snap(parseFloat(el.style.width));
            box.h = snap(parseFloat(el.style.height));
            box.x = snap(parseFloat(el.style.left));
            box.y = snap(parseFloat(el.style.top));
            applyLayout();
            saveLayout();
        }

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        ev.preventDefault();
        ev.stopPropagation();
    }

    function snap(v) {
        return Math.round(v / GRID) * GRID;
    }

    function clamp(v, min, max) {
        return Math.min(Math.max(v, min), max);
    }

    /** 当前舞台的缩放比（拖动位移要按它换算，否则鼠标和面板对不上） */
    function currentScale() {
        var m = /scale\(([\d.]+)\)/.exec(document.getElementById('stage').style.transform || '');
        return m ? parseFloat(m[1]) : 1;
    }

    function saveLayout() {
        write(STORE_LAYOUT, layout);
    }

    /* ------------------------------------------------------------------
     * 5. 给每个面板装上手柄，标题栏挂上拖动
     * ------------------------------------------------------------------ */

    var HANDLES = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];

    function initPanels() {
        var list = panels();
        for (var i = 0; i < list.length; i++) {
            (function (el) {
                HANDLES.forEach(function (h) {
                    var grip = document.createElement('div');
                    grip.className = 'rz rz-' + h;
                    grip.addEventListener('pointerdown', function (ev) {
                        startResize(el, h, ev);
                    });
                    el.appendChild(grip);
                });

                var head = el.querySelector('.panel-head');
                if (head) {
                    head.addEventListener('pointerdown', function (ev) {
                        startDrag(el, ev);
                    });
                }
            })(list[i]);
        }
    }

    /* ------------------------------------------------------------------
     * 6. 设置抽屉
     * ------------------------------------------------------------------ */

    var drawer = document.getElementById('drawer');

    function initDrawer() {
        document.getElementById('btn-customize').addEventListener('click', function () {
            drawer.classList.toggle('open');
        });
        document.getElementById('drawer-close').addEventListener('click', function () {
            drawer.classList.remove('open');
        });

        // 面板显隐勾选
        var box = document.getElementById('cfg-panels');
        var names = {
            'kpi-strip': 'KPI 指标',
            'card-custom': '可配置图表',
            'card-trend': '逐年趋势',
            'card-dist': '长尾分布',
            'card-top': 'TOP20',
            'card-album': '专辑分箱',
            'card-scatter': '热度×时长',
            'card-span': '年份跨度',
            'card-search': '搜索面板'
        };
        var html = '';
        for (var id in names) {
            if (!Object.prototype.hasOwnProperty.call(names, id)) {
                continue;
            }
            html += '<label><input type="checkbox" data-panel="' + id + '"' +
                (theme.hidden.indexOf(id) >= 0 ? '' : ' checked') + '>' + names[id] + '</label>';
        }
        box.innerHTML = html;

        box.addEventListener('change', function (e) {
            var cb = e.target.closest('input[data-panel]');
            if (!cb) {
                return;
            }
            var id = cb.getAttribute('data-panel');
            var idx = theme.hidden.indexOf(id);
            if (cb.checked && idx >= 0) {
                theme.hidden.splice(idx, 1);
            } else if (!cb.checked && idx < 0) {
                theme.hidden.push(id);
            }
            applyLayout();
        });

        // 外观控件：改一下立刻预览，点「保存」才落盘
        bindRange('cfg-blur', 'cfg-blur-val', 'blur');
        bindRange('cfg-alpha', 'cfg-alpha-val', 'alpha');
        bindRange('cfg-mix', 'cfg-mix-val', 'mix');
        bindRange('cfg-deg', 'cfg-deg-val', 'deg');
        bindColor('cfg-bg', 'bg');
        bindColor('cfg-c1', 'c1');
        bindColor('cfg-c2', 'c2');

        document.getElementById('btn-save-theme').addEventListener('click', function () {
            write(STORE_THEME, theme);
            write(STORE_LAYOUT, layout);
            toast('已保存到本机浏览器');
        });

        document.getElementById('btn-reset-theme').addEventListener('click', function () {
            theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
            syncThemeInputs();
            applyLayout();
            applyTheme();
            write(STORE_THEME, theme);
            write(STORE_LAYOUT, layout);
            toast('外观已恢复默认');
        });
    }

    function bindRange(inputId, labelId, key) {
        var input = document.getElementById(inputId);
        var label = document.getElementById(labelId);
        input.value = theme[key];
        label.textContent = theme[key];
        input.addEventListener('input', function () {
            theme[key] = parseFloat(input.value);
            label.textContent = input.value;
            applyTheme();
        });
    }

    function bindColor(inputId, key) {
        var input = document.getElementById(inputId);
        input.value = theme[key];
        input.addEventListener('input', function () {
            theme[key] = input.value;
            applyTheme();
        });
    }

    function syncThemeInputs() {
        document.getElementById('cfg-bg').value = theme.bg;
        document.getElementById('cfg-c1').value = theme.c1;
        document.getElementById('cfg-c2').value = theme.c2;
        document.getElementById('cfg-blur').value = theme.blur;
        document.getElementById('cfg-blur-val').textContent = theme.blur;
        document.getElementById('cfg-alpha').value = theme.alpha;
        document.getElementById('cfg-alpha-val').textContent = theme.alpha;
        document.getElementById('cfg-mix').value = theme.mix;
        document.getElementById('cfg-mix-val').textContent = theme.mix;
        document.getElementById('cfg-deg').value = theme.deg;
        document.getElementById('cfg-deg-val').textContent = theme.deg;

        var checks = document.querySelectorAll('#cfg-panels input[data-panel]');
        for (var i = 0; i < checks.length; i++) {
            checks[i].checked = theme.hidden.indexOf(checks[i].getAttribute('data-panel')) < 0;
        }
    }

    function toast(msg) {
        var el = document.getElementById('toast');
        if (!el) {
            return;
        }
        el.textContent = msg;
        el.className = 'show';
        setTimeout(function () { el.className = ''; }, 1800);
    }

    /* ------------------------------------------------------------------
     * 7. 顶部「恢复默认」
     * ------------------------------------------------------------------ */

    function resetAll() {
        layout = {};
        for (var id in DEFAULT_LAYOUT) {
            if (Object.prototype.hasOwnProperty.call(DEFAULT_LAYOUT, id)) {
                layout[id] = {
                    x: DEFAULT_LAYOUT[id].x, y: DEFAULT_LAYOUT[id].y,
                    w: DEFAULT_LAYOUT[id].w, h: DEFAULT_LAYOUT[id].h
                };
            }
        }
        theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
        try {
            localStorage.removeItem(STORE_LAYOUT);
            localStorage.removeItem(STORE_THEME);
        } catch (e) { /* 忽略 */ }
        applyLayout();
        applyTheme();
        syncThemeInputs();
        toast('布局与外观已恢复默认');
    }

    /* ------------------------------------------------------------------
     * 8. 启动
     * ------------------------------------------------------------------ */

    function boot() {
        initPanels();
        initDrawer();
        applyLayout();
        applyTheme();
        syncThemeInputs();

        document.getElementById('btn-reset-layout').addEventListener('click', resetAll);

        // 窗口尺寸变化时舞台会重新缩放，图表不需要重绘（内部像素恒定），
        // 但如果用户拖动过面板高度，ECharts 需要跟着容器尺寸走，这里兜一下。
        window.addEventListener('resize', function () {
            setTimeout(resizeCharts, 60);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // 暴露给 dashboard.js：面板尺寸变化后要重绘图表
    window.DashLayout = {
        resizeCharts: resizeCharts,
        DEFAULT_LAYOUT: DEFAULT_LAYOUT
    };
})();
