/* ==========================================================================
 * track-admin.js  ——  曲目数据管理（增 / 删 / 改 / 查）
 *
 * 这是大屏唯一的“写”入口。之前整个页面只有 6 个只读聚合接口，
 * 数据进了库就只能看不能动，答辩时被问“增删改查在哪”会当场答不上来。
 *
 * 分工：
 *   · 读列表 / 读单条 / 增 / 改 / 删  →  /api/tracks  (TrackController2)
 *   · 写完后调 window.__DASH__.reload() → 让 6 张图重新取数，做到“改一条，图跟着动”
 *
 * 为什么写操作后不 location.reload()：
 *   那会把用户已经拖好的年代区间、曲风筛选全部清空。
 *   reload() 只重取数据并重画，交互状态原样保留。
 * ========================================================================== */
(function () {
  'use strict';

  var API = '/api/tracks';

  var S = {
    page: 1,
    size: 15,
    kw: '',
    genre: '',
    yearFrom: '',
    yearTo: '',
    pages: 0,
    total: 0,
    editingId: null,   // null = 新增；否则 = 编辑中的 track_id
    busy: false
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(n, d) {
    if (n === null || n === undefined || n === '' || isNaN(n)) { return '—'; }
    return Number(n).toFixed(d === undefined ? 0 : d);
  }

  /* ------------------------------------------------------------ 请求层 */
  function request(url, opts) {
    var cfg = opts || {};
    cfg.cache = 'no-store';
    if (cfg.body && typeof cfg.body !== 'string') {
      cfg.headers = { 'Content-Type': 'application/json;charset=UTF-8' };
      cfg.body = JSON.stringify(cfg.body);
    }
    return fetch(url, cfg).then(function (r) {
      return r.json().catch(function () {
        throw new Error('响应不是合法 JSON（HTTP ' + r.status + '）');
      });
    }).then(function (res) {
      /* 与 screen.js 的 unwrap 同口径：业务码 200 才算成功 */
      if (!res || res.code !== 200) {
        throw new Error((res && res.msg) || '请求失败');
      }
      return res.data;
    });
  }

  /* ------------------------------------------------------------ 提示条 */
  var toastTimer = null;
  function toast(msg, isErr) {
    var el = $('dataToast');
    if (!el) { return; }
    el.textContent = msg;
    el.className = 'data-toast on' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'data-toast'; }, isErr ? 5200 : 2400);
  }

  /* ------------------------------------------------------------ 抽屉开合 */
  function openDrawer() {
    $('dataMask').classList.add('on');
    $('dataDrawer').classList.add('on');
    $('dataDrawer').setAttribute('aria-hidden', 'false');
    var btn = $('btnData');
    if (btn) { btn.classList.add('on'); }
    fillGenreSelect();
    loadList();
  }

  function closeDrawer() {
    $('dataMask').classList.remove('on');
    $('dataDrawer').classList.remove('on');
    $('dataDrawer').setAttribute('aria-hidden', 'true');
    var btn = $('btnData');
    if (btn) { btn.classList.remove('on'); }
    closeForm();
  }

  function drawerOpen() {
    var d = $('dataDrawer');
    return d && d.classList.contains('on');
  }

  /* 曲风下拉：从大屏已经取到的 overview.genre 里拿，避免再开一个接口 */
  function fillGenreSelect() {
    var sel = $('dataGenre');
    if (!sel || sel.dataset.ready === '1') { return; }
    var dash = window.__DASH__;
    var genres = (((dash && dash.data && dash.data.overview) || {}).genre) || [];
    genres.slice().sort(function (a, b) { return b.cnt - a.cnt; }).forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.genre;
      o.textContent = g.genre;
      sel.appendChild(o);
    });
    sel.dataset.ready = '1';
  }

  /* ------------------------------------------------------------ 查 */
  function buildQuery() {
    var q = ['page=' + S.page, 'size=' + S.size];
    if (S.kw) { q.push('kw=' + encodeURIComponent(S.kw)); }
    if (S.genre) { q.push('genre=' + encodeURIComponent(S.genre)); }
    if (S.yearFrom !== '') { q.push('yearFrom=' + S.yearFrom); }
    if (S.yearTo !== '') { q.push('yearTo=' + S.yearTo); }
    return API + '?' + q.join('&');
  }

  function loadList() {
    $('dataBody').innerHTML = '<tr><td colspan="9" class="empty">查询中…</td></tr>';
    request(buildQuery()).then(function (d) {
      S.total = d.total;
      S.pages = d.pages;
      S.page = d.page;

      $('dataTotal').textContent = '共 ' + Number(d.total).toLocaleString('zh-CN') + ' 条 · 第 ' + d.page + '/' + Math.max(1, d.pages) + ' 页';
      $('dataPageInfo').textContent = '筛选后 ' + Number(d.total).toLocaleString('zh-CN') + ' 条';
      $('dataPrev').disabled = d.page <= 1;
      $('dataNext').disabled = d.page >= Math.max(1, d.pages);

      if (!d.rows || !d.rows.length) {
        $('dataBody').innerHTML = '<tr><td colspan="9" class="empty">没有符合条件的曲目</td></tr>';
        return;
      }

      var html = d.rows.map(function (r) {
        return '<tr>' +
          '<td class="c-name" title="' + esc(r.track_name) + '">' + esc(r.track_name) + '</td>' +
          '<td class="c-artist" title="' + esc(r.track_artist) + '">' + esc(r.track_artist) + '</td>' +
          '<td>' + esc(r.release_year) + '</td>' +
          '<td><span class="genre-pill">' + esc(r.playlist_genre || '—') + '</span></td>' +
          '<td class="c-num">' + fmt(r.duration_min, 2) + '′</td>' +
          '<td class="c-num">' + fmt(r.loudness, 1) + '</td>' +
          '<td class="c-num">' + fmt(r.tempo, 0) + '</td>' +
          '<td class="c-num">' + esc(r.track_popularity) + '</td>' +
          '<td class="c-op">' +
            '<button class="row-act" data-edit="' + esc(r.track_id) + '">编辑</button>' +
            '<button class="row-act del" data-del="' + esc(r.track_id) + '">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('');

      $('dataBody').innerHTML = html;
      bindRowActions();
    }).catch(function (e) {
      $('dataBody').innerHTML = '<tr><td colspan="9" class="empty">查询失败：' + esc(e.message) + '</td></tr>';
      toast('查询失败：' + e.message, true);
    });
  }

  function bindRowActions() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (b) {
      b.onclick = function () { openForm(b.getAttribute('data-edit')); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (b) {
      b.onclick = function () { removeTrack(b.getAttribute('data-del')); };
    });
  }

  /* ------------------------------------------------------------ 删 */
  function removeTrack(id) {
    if (S.busy) { return; }
    var row = null;
    /* 从表格里找出曲名，让确认框说人话，而不是甩一串 track_id */
    Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (b) {
      if (b.getAttribute('data-del') === id) {
        row = b.closest('tr');
      }
    });
    var name = row ? row.querySelector('.c-name').textContent : id;

    if (!window.confirm('确认删除《' + name + '》？\n\ntrack_id: ' + id + '\n删除后大屏所有图表会重新计算，此操作不可撤销。')) {
      return;
    }

    S.busy = true;
    request(API + '/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
      toast('已删除《' + name + '》，图表已同步刷新');
      loadList();
      refreshDash();
    }).catch(function (e) {
      toast('删除失败：' + e.message, true);
    }).then(function () { S.busy = false; });
  }

  /* ------------------------------------------------------------ 表单 */
  function openForm(id) {
    S.editingId = id || null;
    $('formTitle').textContent = id ? '编辑曲目' : '新增曲目';
    $('formMask').classList.add('on');
    $('fTrackId').disabled = !!id;

    if (!id) {
      ['fTrackId', 'fName', 'fArtist', 'fAlbum', 'fYear', 'fSubGenre',
       'fDuration', 'fLoudness', 'fTempo', 'fPopularity'].forEach(function (k) { $(k).value = ''; });
      $('fGenre').value = '';
      return;
    }

    request(API + '/' + encodeURIComponent(id)).then(function (r) {
      $('fTrackId').value = r.track_id || '';
      $('fName').value = r.track_name || '';
      $('fArtist').value = r.track_artist || '';
      $('fAlbum').value = r.track_album_name || '';
      $('fYear').value = r.release_year || '';
      $('fGenre').value = r.playlist_genre || '';
      $('fSubGenre').value = r.playlist_subgenre || '';
      $('fDuration').value = r.duration_min === undefined ? '' : Number(r.duration_min).toFixed(3);
      $('fLoudness').value = r.loudness === undefined ? '' : Number(r.loudness).toFixed(3);
      $('fTempo').value = r.tempo === undefined ? '' : Number(r.tempo).toFixed(3);
      $('fPopularity').value = r.track_popularity === undefined ? '' : r.track_popularity;
    }).catch(function (e) {
      toast('读取失败：' + e.message, true);
    });
  }

  function closeForm() {
    $('formMask').classList.remove('on');
    S.editingId = null;
  }

  function collect() {
    return {
      track_id: $('fTrackId').value.trim(),
      track_name: $('fName').value.trim(),
      track_artist: $('fArtist').value.trim(),
      track_album_name: $('fAlbum').value.trim(),
      release_year: $('fYear').value,
      playlist_genre: $('fGenre').value,
      playlist_subgenre: $('fSubGenre').value.trim(),
      duration_min: $('fDuration').value,
      loudness: $('fLoudness').value,
      tempo: $('fTempo').value,
      track_popularity: $('fPopularity').value
    };
  }

  function save() {
    if (S.busy) { return; }
    var body = collect();

    /* 前端先挡一遍明显错误，省一次往返；后端 TrackService2 还会再校验一次 */
    if (!body.track_name) { return toast('曲名不能为空', true); }
    if (!body.track_artist) { return toast('艺人不能为空', true); }
    if (!body.release_year) { return toast('发行年份不能为空', true); }

    var isEdit = !!S.editingId;
    if (!isEdit && !body.track_id) { return toast('track_id 不能为空', true); }

    var url = isEdit ? API + '/' + encodeURIComponent(S.editingId) : API;
    var method = isEdit ? 'PUT' : 'POST';

    S.busy = true;
    $('formSave').disabled = true;

    request(url, { method: method, body: body }).then(function (r) {
      toast((isEdit ? '已更新《' : '已新增《') + r.track_name + '》，图表已同步刷新');
      closeForm();
      loadList();
      refreshDash();
    }).catch(function (e) {
      toast((isEdit ? '更新' : '新增') + '失败：' + e.message, true);
    }).then(function () {
      S.busy = false;
      $('formSave').disabled = false;
    });
  }

  /* 写操作完成后刷新大屏：失败只提示，不阻断表格操作 */
  function refreshDash() {
    if (window.__DASH__ && typeof window.__DASH__.reload === 'function') {
      window.__DASH__.reload().catch(function (e) {
        toast('图表刷新失败：' + e.message, true);
      });
    }
  }

  /* ------------------------------------------------------------ 事件绑定 */
  function bind() {
    $('btnData').onclick = function () { drawerOpen() ? closeDrawer() : openDrawer(); };
    $('dataClose').onclick = closeDrawer;
    $('dataMask').onclick = closeDrawer;

    $('dataSearch').onclick = function () {
      S.kw = $('dataKw').value.trim();
      S.genre = $('dataGenre').value;
      S.yearFrom = $('dataYearFrom').value.trim();
      S.yearTo = $('dataYearTo').value.trim();
      S.page = 1;
      loadList();
    };
    $('dataKw').onkeydown = function (e) { if (e.key === 'Enter') { $('dataSearch').click(); } };

    $('dataAdd').onclick = function () { openForm(null); };
    $('dataPrev').onclick = function () { if (S.page > 1) { S.page--; loadList(); } };
    $('dataNext').onclick = function () { if (S.page < S.pages) { S.page++; loadList(); } };

    $('formClose').onclick = closeForm;
    $('formCancel').onclick = closeForm;
    $('formSave').onclick = save;
    $('formMask').onclick = function (e) { if (e.target === $('formMask')) { closeForm(); } };

    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'select' || tag === 'textarea';

      if (e.key === 'Escape') {
        if ($('formMask').classList.contains('on')) { closeForm(); }
        else if (drawerOpen()) { closeDrawer(); }
        return;
      }
      if (typing) { return; }
      /* 按 D 开抽屉：答辩时不用去点按钮，直接敲键演示 */
      if ((e.key === 'd' || e.key === 'D') && !drawerOpen()) {
        e.preventDefault();
        openDrawer();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  /* 支持 ?panel=data 直接打开抽屉：
     答辩演示和截图回归时不用手动点按钮 */
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('panel') === 'data') {
      var boot = function () { setTimeout(openDrawer, 300); };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
      } else {
        boot();
      }
    }
  } catch (e) { /* 老浏览器不支持 URLSearchParams 就忽略 */ }

  /* 暴露给调试用：控制台可以直接 __TRACKS__.loadList() 验证接口 */
  window.__TRACKS__ = { state: S, load: loadList, remove: removeTrack };
})();
