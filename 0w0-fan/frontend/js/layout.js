/* ============================================================================
 * 大屏布局引擎 · layout.js（v3）
 * ----------------------------------------------------------------------------
 * 布局模型：**格子（slot）**，不是任意坐标
 *   · 舞台 1920×1080 上预先划好 N 个格子，每个格子有固定位置和尺寸；
 *   · 每个面板占一个格子，面板大小永远等于格子大小 —— 所以不会出现
 *     「大小不一的面板互相挤变形」这种问题，图表本身是响应式的，换格子后自动重排；
 *   · 拖动面板到另一个格子：
 *       交换模式 → 两个面板互换格子（图表跟着换位置与尺寸）
 *       吸附模式 → 只回到自己最近的格子（不做交换）
 *   · 拖动默认是**关闭**的（演示时容易误拖），要在「自定义」里勾上「允许拖动布局」。
 *
 * 外观模型：
 *   背景渐变（页面底色）与面板渐变（卡片底色）分开配置，毛玻璃、面板不透明度独立可调；
 *   全部存 localStorage，「恢复默认」一键还原。
 * ========================================================================== */
(function () {
    'use strict';

    var STORE_LAYOUT = 'spotify-dash-layout-v2';
    var STORE_THEME = 'spotify-dash-theme-v2';

    var canvas = document.getElementById('canvas');
    if (!canvas) {
        return;
    }

    /* ------------------------------------------------------------------
     * 1. 格子表（1920×1080 设计稿坐标，原点 = 舞台左上角）
     *    面板坐标与顶栏的 16px 边距对齐：左列 x=16，右列右边到 1904
     * ------------------------------------------------------------------ */
    var SLOTS = [
        { id: 's-trend', x: 16, y: 102, w: 502, h: 340 },
        { id: 's-dist', x: 16, y: 456, w: 502, h: 297 },
        { id: 's-top', x: 16, y: 767, w: 502, h: 297 },

        { id: 's-kpi', x: 532, y: 102, w: 856, h: 110 },
        { id: 's-custom', x: 532, y: 226, w: 856, h: 546 },
        { id: 's-album', x: 532, y: 786, w: 421, h: 278 },
        { id: 's-scatter', x: 967, y: 786, w: 421, h: 278 },

        { id: 's-span', x: 1402, y: 102, w: 502, h: 474 },
        { id: 's-search', x: 1402, y: 590, w: 502, h: 474 }
    ];

    /** 面板 → 格子的默认归属 */
    var DEFAULT_ASSIGN = {
        'card-trend': 's-trend',
        'card-dist': 's-dist',
        'card-top': 's-top',
        'kpi-strip': 's-kpi',
        'card-custom': 's-custom',
        'card-album': 's-album',
        'card-scatter': 's-scatter',
        'card-span': 's-span',
        'card-search': 's-search'
    };

    var DEFAULT_THEME = {
        allowDrag: false,        // 是否允许拖动（默认关）
        dragMode: 'swap',        // swap = 交换格子；snap = 只吸回自己的格子
        blur: 0,                 // 面板毛玻璃（px）
        alpha: 92,               // 面板底色不透明度（%）
        bg: { c1: '#070C16', c2: '#0B1120', mix: 0, deg: 135 },     // 页面背景渐变
        panel: { c1: '#22D3EE', c2: '#A78BFA', mix: 0, deg: 135 },  // 面板渐变
        hidden: []
    };

    /* ------------------------------------------------------------------
     * 2. 存取
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
        } catch (e) { /* 隐私模式下写不进去，忽略 */ }
    }

    function clone(o) {
        return JSON.parse(JSON.stringify(o));
    }

    var assign = read(STORE_LAYOUT, null) || clone(DEFAULT_ASSIGN);
    var theme = read(STORE_THEME, null) || clone(DEFAULT_THEME);

    function slotOf(slotId) {
        for (var i = 0; i < SLOTS.length; i++) {
            if (SLOTS[i].id === slotId) {
                return SLOTS[i];
            }
        }
        return null;
    }

    function panelSlotId(panelId) {
        return assign[panelId] || DEFAULT_ASSIGN[panelId];
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
            var slot = slotOf(panelSlotId(el.id));
            if (!slot) {
                continue;
            }
            el.style.left = slot.x + 'px';
            el.style.top = slot.y + 'px';
            el.style.width = slot.w + 'px';
            el.style.height = slot.h + 'px';
            el.style.display = theme.hidden.indexOf(el.id) >= 0 ? 'none' : '';
        }
        resizeCharts();
    }

    /**
     * 面板换了格子之后，把里面的图重新量一次尺寸。
     * 顺便做「小格子自动精简」：格子变小的时候把图例、部分标签收起来，
     * 免得文字挤成一团 —— 这是交换格子方案里唯一需要额外照顾的地方。
     */
    function resizeCharts() {
        if (!window.echarts) {
            return;
        }
        var list = canvas.querySelectorAll('.chart');
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            var inst = echarts.getInstanceByDom(el);
            if (!inst) {
                continue;
            }
            inst.resize();

            var w = el.clientWidth;
            var h = el.clientHeight;
            var compact = (w < 600 || h < 300);
            try {
                inst.setOption({
                    legend: { show: !compact },
                    grid: compact
                        ? { left: 40, right: 12, top: 16, bottom: 20 }
                        : { left: 52, right: 22, top: 34, bottom: 40 }
                });
            } catch (e) { /* 某些图形没有 legend/grid，忽略 */ }
        }
    }

    function hex2rgba(hex, alpha) {
        var h = String(hex || '#000').replace('#', '');
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        return 'rgba(' + parseInt(h.substring(0, 2), 16) + ',' +
            parseInt(h.substring(2, 4), 16) + ',' + parseInt(h.substring(4, 6), 16) + ',' + alpha + ')';
    }

    function applyTheme() {
        // 页面背景：底色 + 可选渐变层（强度 = 渐变色的透明度）
        var bgm = theme.bg.mix / 100;
        document.body.style.background = bgm > 0
            ? ('linear-gradient(' + theme.bg.deg + 'deg, ' + hex2rgba(theme.bg.c1, 1) + ' 0%, ' +
               hex2rgba(theme.bg.c2, bgm * 2 > 1 ? 1 : bgm * 2) + ' 100%)')
            : theme.bg.c1;

        var pm = theme.panel.mix / 100;
        var a = theme.alpha / 100;
        var list = panels();

        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            var layers = [];
            if (pm > 0) {
                layers.push('linear-gradient(' + theme.panel.deg + 'deg, ' +
                    hex2rgba(theme.panel.c1, pm) + ', ' + hex2rgba(theme.panel.c2, pm) + ')');
            }
            layers.push('linear-gradient(165deg, ' + hex2rgba('#0D192B', a) + ', ' + hex2rgba('#09111F', a) + ')');
            el.style.background = layers.join(',');
            el.style.backdropFilter = theme.blur > 0 ? ('blur(' + theme.blur + 'px)') : '';
            el.style.webkitBackdropFilter = el.style.backdropFilter;
        }
    }

    /* ------------------------------------------------------------------
     * 4. 拖动：只在「允许拖动」打开时生效
     * ------------------------------------------------------------------ */

    function currentScale() {
        var m = /scale\(([\d.]+)\)/.exec(document.getElementById('stage').style.transform || '');
        return m ? parseFloat(m[1]) : 1;
    }

    /** 拖动时用来提示「会落到哪个格子」的虚线框 */
    var hint = null;

    function showHint(slot) {
        if (!hint) {
            hint = document.createElement('div');
            hint.className = 'slot-hint';
            canvas.appendChild(hint);
        }
        hint.style.left = slot.x + 'px';
        hint.style.top = slot.y + 'px';
        hint.style.width = slot.w + 'px';
        hint.style.height = slot.h + 'px';
        hint.style.display = 'block';
    }

    function hideHint() {
        if (hint) {
            hint.style.display = 'none';
        }
    }

    /** 找离面板中心最近的格子 */
    function nearestSlot(panelEl) {
        var pid = panelEl.id;
        var cur = slotOf(panelSlotId(pid));
        var rect = panelEl.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var best = null;
        var bestD = Infinity;

        for (var i = 0; i < SLOTS.length; i++) {
            var s = SLOTS[i];
            var el = canvas.getBoundingClientRect();
            var scale = currentScale();
            var sx = el.left + (s.x + s.w / 2) * scale;
            var sy = el.top + (s.y + s.h / 2) * scale;
            var d = Math.pow(sx - cx, 2) + Math.pow(sy - cy, 2);
            if (d < bestD) {
                bestD = d;
                best = s;
            }
        }
        return best || cur;
    }

    function startDrag(el, ev) {
        if (!theme.allowDrag) {
            return;                       // 默认关闭：直接不响应，避免演示时误拖
        }
        if (ev.target.closest('select, input, button')) {
            return;
        }

        var startX = ev.clientX;
        var startY = ev.clientY;
        var scale = currentScale();
        var moved = false;
        var target = null;

        el.classList.add('dragging');
        document.body.classList.add('dragging');

        function onMove(e) {
            var dx = (e.clientX - startX) / scale;
            var dy = (e.clientY - startY) / scale;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                moved = true;
            }
            el.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
            if (moved) {
                target = nearestSlot(el);
                if (target && target.id !== panelSlotId(el.id)) {
                    showHint(target);
                } else {
                    hideHint();
                }
            }
        }

        function onUp() {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            el.classList.remove('dragging');
            document.body.classList.remove('dragging');
            el.style.transform = '';
            hideHint();

            if (!moved) {
                return;
            }

            var mode = theme.dragMode;
            if (mode === 'swap' && target && target.id !== panelSlotId(el.id)) {
                // 找到占着目标格子的那个面板，两者互换（没有占用者就直接搬过去）
                var occupant = null;
                for (var pid in assign) {
                    if (Object.prototype.hasOwnProperty.call(assign, pid) && pid !== el.id &&
                        assign[pid] === target.id) {
                        occupant = pid;
                        break;
                    }
                }
                var mine = panelSlotId(el.id);
                assign[el.id] = target.id;
                if (occupant) {
                    assign[occupant] = mine;
                }
                write(STORE_LAYOUT, assign);
                applyLayout();
                toast(occupant ? '已互换位置' : '已移动');
                return;
            }

            applyLayout();   // snap 模式：直接吸回最近的格子（其实就是自己原来的位置）
        }

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        ev.preventDefault();
    }

    /* ------------------------------------------------------------------
     * 5. 初始化：不再有缩放手柄，只挂标题栏拖动
     * ------------------------------------------------------------------ */

    function initPanels() {
        var list = panels();
        for (var i = 0; i < list.length; i++) {
            (function (el) {
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
     * 6. 设置弹窗
     * ------------------------------------------------------------------ */

    var PANEL_NAMES = {
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

    function initModal() {
        var modal = document.getElementById('modal');
        var mask = document.getElementById('modal-mask');

        function open() {
            modal.classList.add('open');
            mask.classList.add('open');
            syncInputs();
        }

        function close() {
            modal.classList.remove('open');
            mask.classList.remove('open');
        }

        document.getElementById('btn-customize').addEventListener('click', function () {
            if (modal.classList.contains('open')) {
                close();
            } else {
                open();
            }
        });
        document.getElementById('modal-close').addEventListener('click', close);
        mask.addEventListener('click', close);

        // 面板显隐
        var box = document.getElementById('cfg-panels');
        var html = '';
        for (var id in PANEL_NAMES) {
            if (Object.prototype.hasOwnProperty.call(PANEL_NAMES, id)) {
                html += '<label><input type="checkbox" data-panel="' + id + '">' + PANEL_NAMES[id] + '</label>';
            }
        }
        box.innerHTML = html;
        box.addEventListener('change', function (e) {
            var cb = e.target.closest('input[data-panel]');
            if (!cb) {
                return;
            }
            var pid = cb.getAttribute('data-panel');
            var idx = theme.hidden.indexOf(pid);
            if (cb.checked && idx >= 0) {
                theme.hidden.splice(idx, 1);
            } else if (!cb.checked && idx < 0) {
                theme.hidden.push(pid);
            }
            applyLayout();
        });

        // 拖动开关与方式
        document.getElementById('cfg-allow-drag').addEventListener('change', function (e) {
            theme.allowDrag = e.target.checked;
        });
        document.getElementById('cfg-drag-mode').addEventListener('change', function (e) {
            theme.dragMode = e.target.value;
        });

        // 滑块：毛玻璃 / 不透明度
        bindRange('cfg-blur', 'cfg-blur-val', theme, 'blur');
        bindRange('cfg-alpha', 'cfg-alpha-val', theme, 'alpha');

        // 两组渐变
        bindColor('cfg-bg-c1', theme.bg, 'c1');
        bindColor('cfg-bg-c2', theme.bg, 'c2');
        bindRange2('cfg-bg-mix', 'cfg-bg-mix-val', theme.bg, 'mix');
        bindRange2('cfg-bg-deg', 'cfg-bg-deg-val', theme.bg, 'deg');
        bindColor('cfg-pn-c1', theme.panel, 'c1');
        bindColor('cfg-pn-c2', theme.panel, 'c2');
        bindRange2('cfg-pn-mix', 'cfg-pn-mix-val', theme.panel, 'mix');
        bindRange2('cfg-pn-deg', 'cfg-pn-deg-val', theme.panel, 'deg');

        document.getElementById('btn-save-theme').addEventListener('click', function () {
            write(STORE_THEME, theme);
            write(STORE_LAYOUT, assign);
            toast('已保存到本机浏览器');
        });

        document.getElementById('btn-reset-theme').addEventListener('click', function () {
            theme = clone(DEFAULT_THEME);
            applyTheme();
            applyLayout();
            syncInputs();
            write(STORE_THEME, theme);
            toast('外观已恢复默认');
        });
    }

    function bindRange(inputId, labelId, holder, key) {
        var input = document.getElementById(inputId);
        var label = document.getElementById(labelId);
        input.value = holder[key];
        label.textContent = holder[key];
        input.addEventListener('input', function () {
            holder[key] = parseFloat(input.value);
            label.textContent = input.value;
            if (key === 'blur' || key === 'alpha') {
                applyTheme();
            }
        });
    }

    function bindRange2(inputId, labelId, holder, key) {
        var input = document.getElementById(inputId);
        var label = document.getElementById(labelId);
        input.value = holder[key];
        label.textContent = holder[key];
        input.addEventListener('input', function () {
            holder[key] = parseFloat(input.value);
            label.textContent = input.value;
            applyTheme();
        });
    }

    function bindColor(inputId, holder, key) {
        var input = document.getElementById(inputId);
        input.value = holder[key];
        input.addEventListener('input', function () {
            holder[key] = input.value;
            applyTheme();
        });
    }

    function syncInputs() {
        document.getElementById('cfg-allow-drag').checked = !!theme.allowDrag;
        document.getElementById('cfg-drag-mode').value = theme.dragMode;

        document.getElementById('cfg-blur').value = theme.blur;
        document.getElementById('cfg-blur-val').textContent = theme.blur;
        document.getElementById('cfg-alpha').value = theme.alpha;
        document.getElementById('cfg-alpha-val').textContent = theme.alpha;

        var g = [
            ['cfg-bg-c1', theme.bg.c1], ['cfg-bg-c2', theme.bg.c2],
            ['cfg-pn-c1', theme.panel.c1], ['cfg-pn-c2', theme.panel.c2]
        ];
        g.forEach(function (p) { document.getElementById(p[0]).value = p[1]; });

        document.getElementById('cfg-bg-mix').value = theme.bg.mix;
        document.getElementById('cfg-bg-mix-val').textContent = theme.bg.mix;
        document.getElementById('cfg-bg-deg').value = theme.bg.deg;
        document.getElementById('cfg-bg-deg-val').textContent = theme.bg.deg;
        document.getElementById('cfg-pn-mix').value = theme.panel.mix;
        document.getElementById('cfg-pn-mix-val').textContent = theme.panel.mix;
        document.getElementById('cfg-pn-deg').value = theme.panel.deg;
        document.getElementById('cfg-pn-deg-val').textContent = theme.panel.deg;

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
     * 7. 恢复默认（布局 + 外观）
     * ------------------------------------------------------------------ */

    function resetAll() {
        assign = clone(DEFAULT_ASSIGN);
        theme = clone(DEFAULT_THEME);
        try {
            localStorage.removeItem(STORE_LAYOUT);
            localStorage.removeItem(STORE_THEME);
        } catch (e) { /* 忽略 */ }
        applyLayout();
        applyTheme();
        syncInputs();
        toast('布局与外观已恢复默认');
    }

    /* ------------------------------------------------------------------
     * 8. 启动
     * ------------------------------------------------------------------ */

    function boot() {
        initPanels();
        initModal();
        applyLayout();
        applyTheme();
        syncInputs();

        document.getElementById('btn-reset-layout').addEventListener('click', resetAll);
        window.addEventListener('resize', function () {
            setTimeout(resizeCharts, 60);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.DashLayout = {
        resizeCharts: resizeCharts,
        SLOTS: SLOTS,
        isDragAllowed: function () { return !!theme.allowDrag; }
    };
})();
