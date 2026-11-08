/* ============================================================================
 * 大屏布局引擎 · layout.js（v4）
 * ----------------------------------------------------------------------------
 * 布局模型：**格子（slot）**，不是任意坐标
 *   · 舞台 1920×1080 上预先划好 9 个格子，每个格子有固定位置和尺寸；
 *   · 每个面板占一个格子，面板大小永远等于格子大小；
 *   · 拖动面板到另一个格子 → 两个面板互换格子（图表跟着换位置与尺寸）；
 *   · 拖动默认关闭，要在「自定义」里勾上「允许拖动布局」。
 *
 * 外观模型（v4 精简）：背景渐变 / 面板渐变 / 毛玻璃 / 面板不透明度 全部下线，
 * 外观固定用 dashboard.css 里的主题变量；「自定义」只保留两件事：
 *     ① 哪些面板要显示    ② 允不允许拖动布局
 *
 * 动画模型（v4 修闪烁）—— 用 FLIP，而不是「宽度高度过渡」：
 *   旧版落位时同时过渡 left/top/width/height，并且**每帧**对全部图表调 resize()。
 *   容器尺寸每帧在变、画布每帧重设像素尺寸、浏览器每帧重绘整屏 canvas，
 *   于是肉眼看到的就是「切换方一直闪动」。
 *
 *   v4 的做法：
 *     ① 几何**一次性**跳到最终值，图表也在这一刻 resize 到最终尺寸（只 resie 一次）；
 *     ② 用 transform 反向位移 + 过渡到 0 来做「看起来在滑」的动画。
 *        几何早已落定，所以画布全程不重设、不闪烁、不残缺。
 * ========================================================================== */
(function () {
    'use strict';

    var STORE_LAYOUT = 'spotify-dash-layout-v2';
    var STORE_THEME = 'spotify-dash-theme-v3';

    var canvas = document.getElementById('canvas');
    if (!canvas) {
        return;
    }

    /* 1920×1080 设计稿坐标，原点 = 舞台左上角 */
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

    /* 唯一不参与交换的是 KPI 指标条：可拖动但松手滑回原位 */
    var LOCKED = ['kpi-strip'];

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
        allowDrag: false,
        hidden: []
    };

    /* ---------------- 存取 ---------------- */

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
    var stored = read(STORE_THEME, null);
    /* 老版本 localStorage 里留着 blur/alpha/bg/panel/dragMode 等字段，一律丢掉 */
    var theme = {
        allowDrag: !!(stored && stored.allowDrag),
        hidden: (stored && Array.isArray(stored.hidden)) ? stored.hidden : []
    };

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

    /* ---------------- 应用布局 ---------------- */

    function panels() {
        return canvas.querySelectorAll('.panel');
    }

    /** 把某块面板几何对齐到它的格子（不带动画、不 resize） */
    function place(el) {
        var slot = slotOf(panelSlotId(el.id));
        if (!slot) {
            return null;
        }
        el.style.left = slot.x + 'px';
        el.style.top = slot.y + 'px';
        el.style.width = slot.w + 'px';
        el.style.height = slot.h + 'px';
        el.style.display = theme.hidden.indexOf(el.id) >= 0 ? 'none' : '';
        return slot;
    }

    function applyLayout() {
        var list = panels();
        for (var i = 0; i < list.length; i++) {
            place(list[i]);
        }
        resizeCharts(false);
    }

    /**
     * 让每张图跟上自己容器的尺寸。
     * v4：**只在几何落定后调用**，绝不在动画过程中逐帧调用。
     * @param {boolean} quick true = 只同步画布像素尺寸；false = 额外调整图例与边距
     */
    function resizeCharts(quick) {
        if (!window.echarts) {
            return;
        }
        var list = canvas.querySelectorAll('.chart');
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el.clientWidth === 0 || el.clientHeight === 0) {
                continue;
            }
            var inst = echarts.getInstanceByDom(el);
            if (!inst) {
                continue;
            }
            inst.resize();
            if (quick) {
                continue;
            }

            // 小格子自动精简：换进窄格时把图例收起来，免得文字挤成一团
            var w = el.clientWidth;
            var h = el.clientHeight;
            var compact = (w < 600 || h < 300);
            try {
                inst.setOption({
                    legend: { show: !compact },
                    grid: compact
                        ? { left: 42, right: 14, top: 16, bottom: 22 }
                        : { left: 54, right: 24, top: 34, bottom: 40 }
                });
            } catch (e) { /* 饼图 / 雷达图没有 grid，忽略 */ }
        }
    }

    /* ---------------- 拖动 ---------------- */

    function currentScale() {
        var m = /scale\(([\d.]+)\)/.exec(document.getElementById('stage').style.transform || '');
        return m ? parseFloat(m[1]) : 1;
    }

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

    /**
     * 找离鼠标落点最近的格子。用指针坐标而不是面板当前位置：
     * 拖动时面板有跟手延迟，手快的人松手瞬间面板还没滑到位。
     */
    function nearestSlotAt(clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        var scale = currentScale();
        var cx = (clientX - rect.left) / scale;
        var cy = (clientY - rect.top) / scale;
        var best = null;
        var bestD = Infinity;

        for (var i = 0; i < SLOTS.length; i++) {
            var s = SLOTS[i];
            var sx = s.x + s.w / 2;
            var sy = s.y + s.h / 2;
            var d = Math.pow(sx - cx, 2) + Math.pow(sy - cy, 2);
            if (d < bestD) {
                bestD = d;
                best = s;
            }
        }
        return best;
    }

    function occupantOf(slotId) {
        for (var pid in assign) {
            if (Object.prototype.hasOwnProperty.call(assign, pid) && assign[pid] === slotId) {
                return pid;
            }
        }
        return null;
    }

    function isLocked(panelId) {
        return LOCKED.indexOf(panelId) >= 0;
    }

    var GLIDE_MS = 340;

    /**
     * FLIP 动画：先把几何一次性落定，再用 transform 反向位移 → 0 做出「滑过去」的观感。
     *
     * @param {HTMLElement} el     要动画面板
     * @param {Function}    commit 落定几何的动作（会同步调用 applyLayout / resize 一次）
     */
    function flipTo(el, commit) {
        var r0 = el.getBoundingClientRect();

        // 几何直接落定 —— 图表也在这一刻拿到最终尺寸，全程只 resize 这一次
        commit();
        resizeCharts(false);

        var r1 = el.getBoundingClientRect();
        var dx = r0.left - r1.left;
        var dy = r0.top - r1.top;
        var sw = r0.width / Math.max(r1.width, 1);
        var sh = r0.height / Math.max(r1.height, 1);

        if (!dx && !dy && Math.abs(sw - 1) < 0.001 && Math.abs(sh - 1) < 0.001) {
            return;                 // 位置尺寸都没变，不用动画
        }

        el.style.transition = 'none';
        el.style.transformOrigin = '0 0';
        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sw + ',' + sh + ')';

        // 强制一次重排，让上面的 transform 立即生效，否则会和下一帧合并成「没有动画」
        void el.offsetWidth;

        requestAnimationFrame(function () {
            el.style.transition = 'transform ' + GLIDE_MS + 'ms cubic-bezier(0.22, 0.61, 0.36, 1)';
            el.style.transform = 'translate(0,0) scale(1,1)';
        });

        setTimeout(function () {
            el.style.transition = '';
            el.style.transform = '';
            el.style.transformOrigin = '';
        }, GLIDE_MS + 40);
    }

    /** 拖动结束、松开后把面板原地弹回（清掉拖动位移，带一点回弹感） */
    function settleBack(el) {
        el.style.transition = 'transform ' + GLIDE_MS + 'ms cubic-bezier(0.22, 0.61, 0.36, 1)';
        el.style.transform = 'translate3d(0,0,0) scale(1)';
        setTimeout(function () {
            el.style.transition = '';
            el.style.transform = '';
        }, GLIDE_MS + 40);
    }

    function startDrag(el, ev) {
        if (!theme.allowDrag) {
            return;
        }
        if (ev.target.closest('select, input, button')) {
            return;
        }

        var startX = ev.clientX;
        var startY = ev.clientY;
        var scale = currentScale();
        var moved = false;
        var target = null;

        var tgt = { x: 0, y: 0 };
        var cur = { x: 0, y: 0 };
        var running = true;

        el.style.transition = 'none';
        el.classList.add('dragging');
        document.body.classList.add('dragging');

        function frame() {
            if (!running) {
                return;
            }
            cur.x += (tgt.x - cur.x) * 0.28;
            cur.y += (tgt.y - cur.y) * 0.28;
            el.style.transform = 'translate3d(' + cur.x.toFixed(2) + 'px,' + cur.y.toFixed(2) + 'px,0) scale(1.015)';
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);

        function onMove(e) {
            tgt.x = (e.clientX - startX) / scale;
            tgt.y = (e.clientY - startY) / scale;
            if (Math.abs(tgt.x) > 3 || Math.abs(tgt.y) > 3) {
                moved = true;
            }
            if (moved) {
                target = nearestSlotAt(e.clientX, e.clientY);
                var occ = target ? occupantOf(target.id) : null;
                var blocked = (target && occ && isLocked(occ)) || isLocked(el.id);
                if (target && target.id !== panelSlotId(el.id) && !blocked) {
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
            running = false;
            hideHint();

            el.style.transition = '';

            var occupant = target ? occupantOf(target.id) : null;
            var mineId = panelSlotId(el.id);

            if (!moved || isLocked(el.id)) {
                settleBack(el);
                return;
            }

            var canSwap = target && target.id !== mineId && !(occupant && isLocked(occupant));

            if (canSwap) {
                var other = (occupant && occupant !== el.id)
                    ? document.getElementById(occupant)
                    : null;

                // 交换归属
                assign[el.id] = target.id;
                if (other) {
                    assign[occupant] = mineId;
                }
                write(STORE_LAYOUT, assign);

                // 两块各做一次 FLIP：几何同时落定，动画各自从旧位置滑到新位置
                el.style.transform = '';
                if (other) {
                    flipTo(other, function () { place(other); });
                }
                flipTo(el, function () {
                    var list = panels();
                    for (var i = 0; i < list.length; i++) {
                        place(list[i]);
                    }
                });
                return;
            }

            settleBack(el);
        }

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        ev.preventDefault();
    }

    /* ---------------- 初始化 ---------------- */

    function applyDragCursor() {
        document.body.classList.toggle('drag-enabled', !!theme.allowDrag);
    }

    function initPanels() {
        var list = panels();
        for (var i = 0; i < list.length; i++) {
            (function (el) {
                if (isLocked(el.id)) {
                    el.classList.add('locked');
                }
                /* 有标题栏的用标题栏当把手；KPI 条没有标题栏，整块都能拖 */
                var handle = el.querySelector('.panel-head') || el;
                handle.addEventListener('pointerdown', function (ev) {
                    startDrag(el, ev);
                });
            })(list[i]);
        }
    }

    /* ---------------- 设置弹窗（v4：只剩两组） ---------------- */

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

        var box = document.getElementById('cfg-panels');
        var html = '';
        for (var id in PANEL_NAMES) {
            if (Object.prototype.hasOwnProperty.call(PANEL_NAMES, id)) {
                html += '<label class="cfg-check"><input type="checkbox" data-panel="' + id + '">' +
                    '<span>' + PANEL_NAMES[id] + '</span></label>';
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

        document.getElementById('cfg-allow-drag').addEventListener('change', function (e) {
            theme.allowDrag = e.target.checked;
            applyDragCursor();
        });

        document.getElementById('btn-save-theme').addEventListener('click', function () {
            write(STORE_THEME, theme);
            write(STORE_LAYOUT, assign);
            close();
            toast('已保存');
        });

        document.getElementById('btn-reset-theme').addEventListener('click', function () {
            resetAll();
            toast('已恢复默认');
        });
    }

    function syncInputs() {
        var cb = document.getElementById('cfg-allow-drag');
        if (cb) {
            cb.checked = !!theme.allowDrag;
        }
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

    /* ---------------- 恢复默认 ---------------- */

    /**
     * 一键还原。v3 的 bug：这里只同步了勾选框，没有重算「可拖动」鼠标指针，
     * 于是关掉拖动后指针还是 move。v4 把所有受 theme 影响的视觉状态都重算一遍。
     */
    function resetAll() {
        assign = clone(DEFAULT_ASSIGN);
        theme = clone(DEFAULT_THEME);
        try {
            localStorage.removeItem(STORE_LAYOUT);
            localStorage.removeItem(STORE_THEME);
        } catch (e) { /* 忽略 */ }

        var list = panels();
        for (var i = 0; i < list.length; i++) {
            list[i].classList.remove('animating', 'dragging');
            list[i].style.transition = '';
            list[i].style.transform = '';
            list[i].style.transformOrigin = '';
        }
        document.body.classList.remove('dragging');

        applyLayout();
        applyDragCursor();     /* ← 关键：把指针状态也重算，指针不会再停在「可移动」 */
        syncInputs();
    }

    /* ---------------- 启动 ---------------- */

    function boot() {
        initPanels();
        initModal();
        applyLayout();
        syncInputs();
        applyDragCursor();

        document.getElementById('btn-reset-layout').addEventListener('click', function () {
            resetAll();
            toast('布局已恢复默认');
        });

        window.addEventListener('resize', function () {
            setTimeout(function () { resizeCharts(false); }, 60);
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
