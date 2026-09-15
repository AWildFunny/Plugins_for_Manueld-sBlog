(function ($) {
    'use strict';

    var bootRoot = window.CI_BOOT || {};
    var boot = (bootRoot.components && bootRoot.components['album-shot']) || {};
    var library = [];
    var items = [];
    var selected = 0;
    var drag = null;
    var libDragUrl = '';
    var editingText = -1;
    var activeId = '';
    var replaceOnInsert = false;
    var replaceNeedle = '';
    var loadingSnap = false;
    var historyView = [];
    var HIST_KEY = 'albumShot.history.v1';
    var HIST_MAX = 30;

    function escapeHtml(v) {
        return window.CI_escapeHtml ? window.CI_escapeHtml(v) : String(v || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeAttr(v) {
        return window.CI_escapeAttr ? window.CI_escapeAttr(v) : String(v || '')
            .replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function isImageUrl(url, name) {
        var s = ((url || '') + ' ' + (name || '')).toLowerCase();
        return /\.(jpe?g|png|gif|webp|bmp|svg|avif|tiff?)(\?|#|$)/i.test(s) || /image\//i.test(s);
    }

    function isUsableUrl(url) {
        return !!(url && /^(https?:\/\/|\/)/i.test(url) && url.indexOf('###') !== 0);
    }

    /** 从写文章页 #file-list 刮取；真实地址在 li[data-url]，href 常为 ### */
    function scrapeDomImages() {
        var images = [];
        $('#file-list li').each(function () {
            var $li = $(this);
            var url = $li.attr('data-url') || $li.data('url') || '';
            var isImage = $li.attr('data-image');
            if (isImage === '0' || isImage === 0) {
                return;
            }
            var $insert = $li.find('a.insert').first();
            var name = $.trim($insert.text()) || $.trim($li.text()) || 'image';
            if (!isUsableUrl(url)) {
                var href = $insert.attr('href') || '';
                if (isUsableUrl(href)) {
                    url = href;
                }
            }
            if (!isUsableUrl(url) && $insert.attr('onclick')) {
                var m = String($insert.attr('onclick')).match(/['"](https?:\/\/[^'"]+|\/[^'"]+)['"]/);
                if (m) url = m[1];
            }
            if (!isUsableUrl(url)) {
                return;
            }
            if (isImage === '1' || isImage === 1 || isImageUrl(url, name)) {
                images.push({ url: url, name: name });
            }
        });
        return images;
    }

    function mergeLibrary(extra) {
        var map = {};
        var out = [];
        function push(item) {
            if (!item || !isUsableUrl(item.url)) {
                return;
            }
            if (map[item.url]) {
                return;
            }
            map[item.url] = true;
            out.push({
                url: item.url,
                name: item.name || item.url.split('/').pop() || 'image'
            });
        }
        (Array.isArray(boot.images) ? boot.images : []).forEach(push);
        (extra || []).forEach(push);
        scrapeDomImages().forEach(push);
        library = out;
        return library;
    }

    function currentSrc() {
        return $.trim($('#as-src').val());
    }

    function setSrc(url) {
        $('#as-src').val(url || '');
        renderLibrary();
        if (window.CI_refreshPreview) {
            window.CI_refreshPreview();
        }
    }

    function renderLibrary() {
        var $grid = $('#as-lib-grid');
        var $empty = $('#as-lib-empty');
        var $count = $('#as-lib-count');
        if (!$grid.length) {
            return;
        }
        $count.text(String(library.length));
        if (!library.length) {
            $grid.empty();
            $empty.prop('hidden', false);
            return;
        }
        $empty.prop('hidden', true);
        var src = currentSrc();
        var boardUrls = {};
        items.forEach(function (it) {
            if (it.src) boardUrls[it.src] = true;
        });
        var html = '';
        library.forEach(function (item, idx) {
            var on = src === item.url || !!boardUrls[item.url];
            html += '<button type="button" class="as-lib-card' + (on ? ' is-on' : '') + '" draggable="true"'
                + ' data-url="' + escapeHtml(item.url) + '"'
                + ' data-idx="' + idx + '"'
                + ' title="' + escapeHtml(item.name) + '">'
                + '<span class="as-lib-thumb"><img src="' + escapeHtml(item.url) + '" alt="" loading="lazy"></span>'
                + '<span class="as-lib-name">' + escapeHtml(item.name) + '</span>'
                + '</button>';
        });
        $grid.html(html);
    }

    function refreshLibrary() {
        mergeLibrary();
        renderLibrary();
    }

    function cat() {
        return $('#as-cat').val() || 'single';
    }

    function isBoardMode() {
        return cat() !== 'single';
    }

    function syncUi() {
        var board = isBoardMode();
        $('#as-layout-field').prop('hidden', board);
        $('#as-alt-wrap').prop('hidden', board);
        $('#as-preset-field').prop('hidden', !board);
        $('#as-ratio-field').prop('hidden', !board);
        $('#as-board-clear').prop('hidden', !board);
        $('#as-custom-wrap').prop('hidden', board || ($('#as-layout').val() || '') !== 'custom');
        var ratioCustom = board && ($('#as-ratio').val() || '') === 'custom';
        $('#as-ratio-custom').prop('hidden', !ratioCustom);
        $('.as-board-ratio-handle').prop('hidden', !ratioCustom);
        $('.as-board-ui').toggleClass('is-ratio-custom', ratioCustom);
        var $hint = $('.as-board-hint');
        if ($hint.length) {
            $hint.text(boardHint());
        }
        syncTextBar();

        var presets = {
            duo: ['duo-split', 'duo-main-side', 'duo-overlap'],
            multi: ['tri-stack', 'tri-row', 'quad'],
            canvas: ['canvas']
        };
        var $preset = $('#as-preset');
        if (board && $preset.length) {
            var allow = presets[cat()] || presets.canvas;
            $preset.find('option').each(function () {
                var v = this.value;
                this.hidden = allow.indexOf(v) === -1 && v !== 'canvas';
            });
            if (allow.indexOf($preset.val()) === -1) {
                $preset.val(allow[0]);
            }
        }
    }

    function clamp(n, a, b) {
        return Math.max(a, Math.min(b, n));
    }

    /** 构图槽位（只排已有图，绝不复制同一张去填空槽） */
    function presetSlots(kind) {
        if (kind === 'duo-split') {
            return [
                { x: 2, y: 6, w: 47, h: 88 },
                { x: 51, y: 6, w: 47, h: 88 }
            ];
        }
        if (kind === 'duo-main-side') {
            return [
                { x: 2, y: 5, w: 60, h: 90 },
                { x: 64, y: 22, w: 34, h: 56 }
            ];
        }
        if (kind === 'duo-overlap') {
            return [
                { x: 5, y: 8, w: 58, h: 84 },
                { x: 40, y: 24, w: 52, h: 70 }
            ];
        }
        if (kind === 'tri-stack') {
            return [
                { x: 2, y: 4, w: 58, h: 92 },
                { x: 62, y: 4, w: 36, h: 44 },
                { x: 62, y: 52, w: 36, h: 44 }
            ];
        }
        if (kind === 'tri-row') {
            return [0, 1, 2].map(function (i) {
                return { x: 2 + i * 32.5, y: 10, w: 31, h: 80 };
            });
        }
        if (kind === 'quad') {
            return [
                { x: 2, y: 4, w: 47, h: 44 },
                { x: 51, y: 4, w: 47, h: 44 },
                { x: 2, y: 52, w: 47, h: 44 },
                { x: 51, y: 52, w: 47, h: 44 }
            ];
        }
        return [];
    }

    function ensureCrop(it) {
        if (!it) {
            return;
        }
        if (it.ox == null || isNaN(it.ox)) {
            it.ox = 50;
        }
        if (it.oy == null || isNaN(it.oy)) {
            it.oy = 50;
        }
        if (it.zoom == null || isNaN(it.zoom)) {
            it.zoom = 1;
        }
        if (!it.h) {
            it.h = 50;
        }
    }

    function isTextItem(it) {
        return !!(it && it.type === 'text');
    }

    function ensureText(it) {
        if (!it) {
            return;
        }
        if (it.fs == null || isNaN(it.fs)) {
            it.fs = 4.5;
        }
        if (!it.color) {
            it.color = '#ffffff';
        }
        if (!it.align) {
            it.align = 'left';
        }
        if (!it.weight) {
            it.weight = '700';
        }
        if (it.shadow == null) {
            it.shadow = 1;
        }
        if (!it.w) {
            it.w = 40;
        }
        if (!it.h) {
            it.h = 18;
        }
        if (it.text == null) {
            it.text = '';
        }
    }

    function applyPreset(kind) {
        if (!kind || kind === 'canvas') {
            return;
        }
        var imgs = items.filter(function (it) {
            return !isTextItem(it);
        });
        if (!imgs.length) {
            return;
        }
        var slots = presetSlots(kind);
        if (!slots.length) {
            return;
        }
        imgs.forEach(function (it, i) {
            ensureCrop(it);
            if (i < slots.length) {
                it.x = slots[i].x;
                it.y = slots[i].y;
                it.w = slots[i].w;
                it.h = slots[i].h;
            } else {
                it.x = clamp(6 + ((i - slots.length) % 3) * 8, 0, 88);
                it.y = clamp(8 + ((i - slots.length) % 4) * 10, 0, 88);
                it.w = 36;
                it.h = 36;
            }
        });
        if (selected >= items.length) {
            selected = Math.max(0, items.length - 1);
        }
    }

    function removeItem(index) {
        if (index < 0 || index >= items.length) {
            return;
        }
        items.splice(index, 1);
        if (selected >= items.length) {
            selected = Math.max(0, items.length - 1);
        }
        if (cat() !== 'canvas' && items.length) {
            applyPreset($('#as-preset').val() || 'duo-split');
        }
        paintBoard();
        renderLibrary();
    }

    function roundRatio(n) {
        n = parseFloat(n);
        if (!isFinite(n) || n <= 0) {
            return 0;
        }
        return Math.round(n * 100) / 100;
    }

    function currentRatio() {
        var v = $('#as-ratio').val() || '3:2';
        if (v === 'custom') {
            var w = roundRatio($('#as-ratio-w').val()) || 3;
            var h = roundRatio($('#as-ratio-h').val()) || 2;
            return w + ':' + h;
        }
        return v;
    }

    function ratioCss() {
        return currentRatio().replace(':', ' / ');
    }

    function boardHint() {
        var extra = ' · 「添加文字」后拖动摆放，双击编辑，滚轮改字号';
        if ($('#as-ratio').val() === 'custom') {
            return '拖动画布下沿调整画幅 · 框内拖动裁剪 · 左下角移动 · 右下角缩放' + extra;
        }
        return '框内拖动裁剪 · 左下角移动画框 · 右下角缩放 · 滚轮变焦' + extra;
    }

    function applyBoardRatio() {
        var el = document.getElementById('as-board');
        if (!el) {
            return;
        }
        var r = ratioCss();
        el.style.setProperty('--board-ratio', r);
        el.style.aspectRatio = r;
    }

    function itemStyle(it) {
        if (isTextItem(it)) {
            ensureText(it);
            return 'left:' + it.x + '%;top:' + it.y + '%;width:' + it.w + '%;height:' + it.h + '%;'
                + '--fs:' + it.fs + ';color:' + it.color + ';text-align:' + it.align + ';font-weight:' + it.weight + ';';
        }
        ensureCrop(it);
        return 'left:' + it.x + '%;top:' + it.y + '%;width:' + it.w + '%;height:' + it.h + '%;'
            + '--ox:' + it.ox + '%;--oy:' + it.oy + '%;--zoom:' + it.zoom + ';';
    }

    function syncBoardFrame(i) {
        var it = items[i];
        var el = document.querySelector('.as-board-item[data-i="' + i + '"]');
        if (!it || !el) {
            return;
        }
        el.setAttribute('style', itemStyle(it));
        if (isTextItem(it)) {
            el.classList.toggle('has-shadow', !!it.shadow);
        }
    }

    function syncTextBar() {
        var it = items[selected];
        var show = isBoardMode() && it && isTextItem(it);
        $('#as-text-bar').prop('hidden', !show);
        if (!show) {
            return;
        }
        ensureText(it);
        $('#as-text-fs').val(it.fs);
        $('#as-text-color').val(/^#[0-9a-fA-F]{6}$/.test(it.color) ? it.color : '#ffffff');
        $('#as-text-align').val(it.align);
        $('#as-text-bold').prop('checked', String(it.weight) === '700' || it.weight === 'bold');
        $('#as-text-shadow').prop('checked', !!it.shadow);
    }

    function applyTextBar() {
        var it = items[selected];
        if (!it || !isTextItem(it)) {
            return;
        }
        it.fs = clamp(parseFloat($('#as-text-fs').val()) || 4.5, 1.5, 16);
        it.color = $('#as-text-color').val() || '#ffffff';
        it.align = $('#as-text-align').val() || 'left';
        it.weight = $('#as-text-bold').prop('checked') ? '700' : '400';
        it.shadow = $('#as-text-shadow').prop('checked') ? 1 : 0;
        syncBoardFrame(selected);
    }

    function boardEditorHtml() {
        return '<div class="as-board-ui as-drop-stage" data-as-drop="1">'
            + '<p class="as-board-hint">' + boardHint() + '</p>'
            + '<div class="as-board-frame">'
            + '<div id="as-board" class="as-board" style="--board-ratio:' + ratioCss() + ';aspect-ratio:' + ratioCss() + '"></div>'
            + '<i class="as-board-ratio-handle" title="拖动下沿调整画幅" hidden></i>'
            + '</div>'
            + '</div>';
    }

    function paintBoard() {
        var $board = $('#as-board');
        if (!$board.length) {
            return;
        }
        if (editingText >= 0 && $board.find('.as-board-text-body[contenteditable="true"]').length) {
            return;
        }
        applyBoardRatio();
        if (!items.length) {
            $board.html('<div class="as-board-empty">将右侧图片拖到此处，或点「添加文字」</div>');
            syncTextBar();
            return;
        }
        var html = '';
        items.forEach(function (it, i) {
            var on = i === selected ? ' is-on' : '';
            if (isTextItem(it)) {
                ensureText(it);
                html += '<div class="as-board-item as-board-text' + (it.shadow ? ' has-shadow' : '') + on + '" data-i="' + i + '" data-type="text" style="' + itemStyle(it) + '">'
                    + '<button type="button" class="as-board-remove" data-remove="' + i + '" title="移除文字" aria-label="移除">×</button>'
                    + '<div class="as-board-text-body" data-i="' + i + '">' + escapeHtml(it.text).replace(/\n/g, '<br>') + '</div>'
                    + '<i class="as-board-handle" data-resize="' + i + '" title="缩放文字框"></i>'
                    + '</div>';
                return;
            }
            ensureCrop(it);
            html += '<figure class="as-board-item is-crop' + on + '" data-i="' + i + '" style="' + itemStyle(it) + '">'
                + '<button type="button" class="as-board-remove" data-remove="' + i + '" title="从画布移除" aria-label="移除">×</button>'
                + '<i class="as-board-move" data-move="' + i + '" title="移动画框"></i>'
                + '<div class="as-board-crop" data-crop="' + i + '"><img src="' + escapeHtml(it.src) + '" alt="" draggable="false"></div>'
                + '<i class="as-board-handle" data-resize="' + i + '" title="缩放画框"></i>'
                + '</figure>';
        });
        $board.html(html);
        syncTextBar();
    }

    function addItem(url) {
        if (!isUsableUrl(url)) {
            return false;
        }
        var n = items.filter(function (it) {
            return !isTextItem(it);
        }).length;
        items.push({
            type: 'image',
            src: url,
            x: 6 + (n % 3) * 8,
            y: 8 + (n % 4) * 10,
            w: n ? 36 : 48,
            h: n ? 40 : 55,
            ox: 50,
            oy: 50,
            zoom: 1,
            alt: ''
        });
        selected = items.length - 1;
        if (cat() !== 'canvas') {
            applyPreset($('#as-preset').val() || 'duo-split');
        }
        paintBoard();
        renderLibrary();
        return true;
    }

    function addText() {
        if (!isBoardMode()) {
            $('#as-cat').val('canvas');
            syncUi();
            var src = currentSrc();
            if (isUsableUrl(src) && !items.some(function (it) {
                return !isTextItem(it) && it.src === src;
            })) {
                addItem(src);
            }
        }
        var n = items.filter(isTextItem).length;
        items.push({
            type: 'text',
            text: '双击编辑文字',
            x: 8 + (n % 3) * 6,
            y: 12 + (n % 4) * 8,
            w: 40,
            h: 18,
            fs: 4.5,
            color: '#ffffff',
            align: 'left',
            weight: '700',
            shadow: 1
        });
        selected = items.length - 1;
        if (!$('#as-board').length && window.CI_refreshPreview) {
            window.CI_refreshPreview();
        }
        window.setTimeout(function () {
            paintBoard();
            syncTextBar();
            renderLibrary();
        }, 0);
    }

    function applyImage(url) {
        if (!isUsableUrl(url)) {
            return;
        }
        if (isBoardMode()) {
            addItem(url);
            if (!$('#as-board').length && window.CI_refreshPreview) {
                window.CI_refreshPreview();
            }
            window.setTimeout(paintBoard, 0);
        } else {
            setSrc(url);
        }
    }

    function previewLayoutClass() {
        var layout = $('#as-layout').val() || 'auto';
        var pos = $('#as-pos').val() || 'top';
        var titlepos = $('#as-titlepos').val() || 'above';
        var wrap = $('#as-wrap').prop('checked');
        var cls = ['as-preview-chapter'];
        if (layout === 'overlay' || (layout === 'custom' && titlepos === 'on')) {
            cls.push('is-overlay');
        } else if (layout === 'split-left' || (layout === 'custom' && titlepos === 'beside' && pos === 'left')) {
            cls.push('is-split', 'is-split-left');
        } else if (layout === 'split-right' || (layout === 'custom' && titlepos === 'beside' && pos === 'right')) {
            cls.push('is-split', 'is-split-right');
        } else if (layout === 'float' || (layout === 'custom' && wrap)) {
            cls.push('is-float');
            if (layout === 'float' && pos === 'right') cls.push('is-right');
            if (layout === 'custom' && pos === 'right') cls.push('is-right');
        } else if (layout === 'custom' && titlepos === 'below') {
            cls.push('is-below');
        } else if (layout === 'banner' || layout === 'auto') {
            cls.push('is-banner');
        }
        return cls.join(' ');
    }

    function singlePreviewHtml() {
        var src = currentSrc();
        var alt = $.trim($('#as-alt').val()) || '章节标题';
        var layout = $('#as-layout').val() || 'auto';
        var media = src
            ? '<div class="as-preview-media"><img src="' + escapeHtml(src) + '" alt=""></div>'
            : '<div class="as-preview-media"><div class="as-preview-ph">将右侧图片拖到此处，或点击选用</div></div>';
        var title = '<h4>' + escapeHtml(alt) + '</h4>';
        var body = '<p class="as-preview-body">单图按原比例显示。当前版式：' + escapeHtml(layout) + '</p>';
        var cls = previewLayoutClass();
        var inner;
        if (cls.indexOf('is-overlay') !== -1 || cls.indexOf('is-below') !== -1) {
            inner = media + title + body;
        } else {
            inner = title + media + body;
        }
        return '<div class="' + cls + ' as-drop-stage" data-as-drop="1">' + inner + '</div>';
    }

    function wrapForMarkdown(code) {
        return String(code || '').trim();
    }

    function newRecordId() {
        return 'as' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
    }

    function postCid() {
        var el = document.querySelector('input[name="cid"]');
        var n = el ? parseInt(el.value, 10) : 0;
        if (n) {
            return String(n);
        }
        var m = String(window.location.search || '').match(/[?&]cid=(\d+)/);
        return m ? m[1] : '0';
    }

    function postTitle() {
        return $.trim($('#title').val() || $('input[name="title"]').val() || '') || '未命名';
    }

    function editorValue() {
        var ta = document.getElementById('text');
        return ta ? String(ta.value || '') : '';
    }

    function encodeDraft(obj) {
        try {
            var json = JSON.stringify(obj);
            var b64 = window.btoa(unescape(encodeURIComponent(json)));
            return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (err) {
            return '';
        }
    }

    function decodeDraft(raw) {
        try {
            var s = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
            while (s.length % 4) {
                s += '=';
            }
            return JSON.parse(decodeURIComponent(escape(window.atob(s))));
        } catch (err) {
            return null;
        }
    }

    function captureSnapshot() {
        return {
            v: 1,
            id: activeId,
            cat: cat(),
            preset: $('#as-preset').val() || '',
            ratio: $('#as-ratio').val() || '3:2',
            ratioW: $('#as-ratio-w').val() || '3',
            ratioH: $('#as-ratio-h').val() || '2',
            layout: $('#as-layout').val() || 'auto',
            pos: $('#as-pos').val() || 'top',
            titlepos: $('#as-titlepos').val() || 'above',
            wrap: $('#as-wrap').prop('checked') ? 1 : 0,
            alt: $.trim($('#as-alt').val()),
            src: currentSrc(),
            items: JSON.parse(JSON.stringify(items || []))
        };
    }

    function snapshotLabel(snap) {
        var names = { single: '单图', duo: '双图', multi: '多图', canvas: '画布' };
        if (!snap) {
            return '图文';
        }
        if ((snap.cat || 'single') === 'single') {
            return (names.single) + ' · ' + (snap.layout || 'auto');
        }
        var imgs = 0;
        var texts = 0;
        (snap.items || []).forEach(function (it) {
            if (it && it.type === 'text') {
                texts += 1;
            } else {
                imgs += 1;
            }
        });
        var bits = [names[snap.cat] || '画布'];
        if (imgs) {
            bits.push(imgs + '图');
        }
        if (texts) {
            bits.push(texts + '字');
        }
        if (snap.ratio === 'custom') {
            bits.push((snap.ratioW || '3') + ':' + (snap.ratioH || '2'));
        } else if (snap.ratio) {
            bits.push(snap.ratio);
        }
        return bits.join(' · ');
    }

    function snapshotThumb(snap) {
        if (snap && snap.src && isUsableUrl(snap.src)) {
            return snap.src;
        }
        var found = '';
        (snap && snap.items ? snap.items : []).some(function (it) {
            if (it && it.src && isUsableUrl(it.src)) {
                found = it.src;
                return true;
            }
            return false;
        });
        return found;
    }

    function formatHistTime(ts) {
        var d = new Date(ts);
        if (!isFinite(d.getTime()) || !ts) {
            return '';
        }
        var p = function (n) {
            return n < 10 ? '0' + n : String(n);
        };
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function readLocalHistory() {
        try {
            var data = JSON.parse(window.localStorage.getItem(HIST_KEY) || '[]');
            return Array.isArray(data) ? data : [];
        } catch (err) {
            return [];
        }
    }

    function writeLocalHistory(list) {
        try {
            window.localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX)));
        } catch (err) {}
    }

    function persistHistory() {
        if (!activeId) {
            activeId = newRecordId();
        }
        var snap = captureSnapshot();
        snap.id = activeId;
        var rec = {
            id: activeId,
            cid: postCid(),
            title: postTitle(),
            savedAt: Date.now(),
            snapshot: snap
        };
        var list = readLocalHistory().filter(function (row) {
            return row && row.id !== activeId;
        });
        list.unshift(rec);
        writeLocalHistory(list);
        return rec;
    }

    function removeLocalHistory(id) {
        writeLocalHistory(readLocalHistory().filter(function (row) {
            return row && row.id !== id;
        }));
        renderHistory();
    }

    function wrapRecord(inner, id) {
        return '<!--album-shot:' + id + '-->\n' + String(inner || '').trim() + '\n<!--/album-shot:' + id + '-->';
    }

    function writeEditorValue(next) {
        var ta = document.getElementById('text');
        if (!ta) {
            window.alert('未找到正文编辑框');
            return false;
        }
        ta.value = next;
        ta.focus();
        if (typeof $ !== 'undefined') {
            $(ta).trigger('input').trigger('change');
        }
        return true;
    }

    function writeOrReplace(payload, id) {
        var value = editorValue();
        var startTag = '<!--album-shot:' + id + '-->';
        var endTag = '<!--/album-shot:' + id + '-->';
        var s = value.indexOf(startTag);
        var e = value.indexOf(endTag);
        if (s !== -1 && e !== -1 && e > s) {
            var next = value.slice(0, s) + payload + value.slice(e + endTag.length);
            return writeEditorValue(next);
        }
        if (replaceNeedle) {
            var at = value.indexOf(replaceNeedle);
            if (at !== -1) {
                return writeEditorValue(value.slice(0, at) + payload + value.slice(at + replaceNeedle.length));
            }
        }
        if (window.CI_insertIntoEditor) {
            return window.CI_insertIntoEditor('\n\n' + payload + '\n\n');
        }
        return false;
    }

    function extractBalancedDiv(html, start) {
        var lower = html.toLowerCase();
        if (lower.slice(start, start + 4) !== '<div') {
            return null;
        }
        var depth = 0;
        var i = start;
        var len = html.length;
        while (i < len) {
            var nextOpen = lower.indexOf('<div', i);
            var nextClose = lower.indexOf('</div', i);
            if (nextClose === -1) {
                return null;
            }
            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth += 1;
                i = nextOpen + 4;
            } else {
                depth -= 1;
                var gt = html.indexOf('>', nextClose);
                if (gt === -1) {
                    return null;
                }
                i = gt + 1;
                if (depth === 0) {
                    return html.slice(start, i);
                }
            }
        }
        return null;
    }

    function parseStyleMap(style) {
        var map = {};
        String(style || '').split(';').forEach(function (part) {
            var cut = part.indexOf(':');
            if (cut < 1) {
                return;
            }
            map[part.slice(0, cut).trim().toLowerCase()] = part.slice(cut + 1).trim();
        });
        return map;
    }

    function pctFromStyle(v, fallback) {
        var n = parseFloat(v);
        return isFinite(n) ? n : (fallback || 0);
    }

    function parseBoardSnapshot(block, idHint) {
        if (!block) {
            return null;
        }
        var draftAttr = block.match(/\bdata-as-draft=["']([^"']+)["']/i);
        if (draftAttr) {
            var drafted = decodeDraft(draftAttr[1]);
            if (drafted && typeof drafted === 'object') {
                return drafted;
            }
        }
        var wrap = document.createElement('div');
        wrap.innerHTML = block;
        var board = wrap.querySelector('.album-board');
        if (!board) {
            return null;
        }
        var ratio = board.getAttribute('data-ratio') || '3:2';
        var parsedItems = [];
        Array.prototype.forEach.call(board.querySelectorAll('.album-board-item, .album-board-text'), function (el) {
            var st = parseStyleMap(el.getAttribute('style') || '');
            var base = {
                x: pctFromStyle(st.left, 4),
                y: pctFromStyle(st.top, 4),
                w: pctFromStyle(st.width, 40),
                h: pctFromStyle(st.height, 20)
            };
            if (el.classList.contains('album-board-text')) {
                var fsM = String(st['font-size'] || '').match(/([\d.]+)\s*\*\s*1cqw/i);
                var htmlText = el.innerHTML || '';
                var text = htmlText.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
                text = $('<textarea>').html(text).text();
                parsedItems.push({
                    type: 'text',
                    text: $.trim(text) || '文字',
                    x: base.x,
                    y: base.y,
                    w: base.w,
                    h: base.h,
                    fs: fsM ? parseFloat(fsM[1]) : 4.5,
                    color: st.color || '#ffffff',
                    align: st['text-align'] || 'left',
                    weight: String(st['font-weight'] || '').indexOf('700') !== -1 || st['font-weight'] === 'bold' ? '700' : '400',
                    shadow: st['text-shadow'] ? 1 : 0
                });
                return;
            }
            var img = el.querySelector('img');
            var src = img ? (img.getAttribute('src') || '') : '';
            if (!isUsableUrl(src)) {
                return;
            }
            parsedItems.push({
                type: 'image',
                src: src,
                alt: img ? (img.getAttribute('alt') || '') : '',
                x: base.x,
                y: base.y,
                w: base.w,
                h: base.h,
                ox: pctFromStyle(st['--ox'], 50),
                oy: pctFromStyle(st['--oy'], 50),
                zoom: parseFloat(st['--zoom']) || 1
            });
        });
        var imgN = 0;
        parsedItems.forEach(function (it) {
            if (!it || it.type !== 'text') {
                imgN += 1;
            }
        });
        var custom = ratio.indexOf(':') !== -1 && ['3:2', '16:9', '4:3', '1:1'].indexOf(ratio) === -1;
        var parts = String(ratio).split(':');
        return {
            v: 1,
            id: idHint || board.getAttribute('data-as-id') || '',
            cat: imgN > 2 ? 'multi' : (imgN === 2 ? 'duo' : 'canvas'),
            preset: 'canvas',
            ratio: custom ? 'custom' : ratio,
            ratioW: parts[0] || '3',
            ratioH: parts[1] || '2',
            layout: 'auto',
            pos: 'top',
            titlepos: 'above',
            wrap: 0,
            alt: '',
            src: '',
            items: parsedItems
        };
    }

    function parseShotSnapshot(code) {
        var raw = String(code || '');
        var get = function (name) {
            var m = raw.match(new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i'));
            return m ? m[1] : '';
        };
        var src = get('src');
        if (!isUsableUrl(src)) {
            return null;
        }
        return {
            v: 1,
            id: '',
            cat: 'single',
            preset: '',
            ratio: '3:2',
            ratioW: '3',
            ratioH: '2',
            layout: get('layout') || 'auto',
            pos: get('pos') || 'top',
            titlepos: get('titlepos') || 'above',
            wrap: get('wrap') ? 1 : 0,
            alt: get('alt'),
            src: src,
            items: []
        };
    }

    function covered(ranges, start, end) {
        return ranges.some(function (r) {
            return start < r.end && end > r.start;
        });
    }

    function scanEditorBlocks() {
        var html = editorValue();
        var out = [];
        var ranges = [];
        var reWrap = /<!--\s*album-shot:([A-Za-z0-9_-]+)\s*-->([\s\S]*?)<!--\s*\/album-shot:\1\s*-->/g;
        var m;
        while ((m = reWrap.exec(html))) {
            ranges.push({ start: m.index, end: m.index + m[0].length });
            var inner = m[2];
            var snap = null;
            if (/class=["'][^"']*\balbum-board\b/i.test(inner) || /\balbum-board\b/.test(inner)) {
                snap = parseBoardSnapshot(inner, m[1]);
            } else if (/\[album-shot\b/i.test(inner)) {
                var sm = inner.match(/\[album-shot\b[^\]]*\]/i);
                snap = sm ? parseShotSnapshot(sm[0]) : null;
            }
            if (snap) {
                snap.id = m[1];
                out.push({
                    id: m[1],
                    raw: m[0],
                    snapshot: snap,
                    inEditor: true,
                    savedAt: 0
                });
            }
        }
        var idx = 0;
        while ((idx = html.indexOf('album-board', idx)) !== -1) {
            var divStart = html.lastIndexOf('<div', idx);
            if (divStart === -1) {
                idx += 11;
                continue;
            }
            var tagEnd = html.indexOf('>', divStart);
            if (tagEnd === -1 || !/\balbum-board\b/.test(html.slice(divStart, tagEnd))) {
                idx += 11;
                continue;
            }
            var block = extractBalancedDiv(html, divStart);
            if (!block) {
                idx += 11;
                continue;
            }
            var end = divStart + block.length;
            idx = end;
            if (covered(ranges, divStart, end)) {
                continue;
            }
            ranges.push({ start: divStart, end: end });
            var boardSnap = parseBoardSnapshot(block, '');
            if (!boardSnap) {
                continue;
            }
            var bid = boardSnap.id || ('as' + Math.abs(divStart).toString(36));
            boardSnap.id = bid;
            out.push({
                id: bid,
                raw: block,
                snapshot: boardSnap,
                inEditor: true,
                savedAt: 0
            });
        }
        var shotRe = /\[album-shot\b[^\]]*\]/gi;
        var sm2;
        while ((sm2 = shotRe.exec(html))) {
            if (covered(ranges, sm2.index, sm2.index + sm2[0].length)) {
                continue;
            }
            var shotSnap = parseShotSnapshot(sm2[0]);
            if (!shotSnap) {
                continue;
            }
            var sid = 'as' + Math.abs(sm2.index).toString(36);
            shotSnap.id = sid;
            out.push({
                id: sid,
                raw: sm2[0],
                snapshot: shotSnap,
                inEditor: true,
                savedAt: 0
            });
        }
        return out;
    }

    function collectHistoryView() {
        var editor = scanEditorBlocks();
        var ids = {};
        editor.forEach(function (row) {
            if (row.id) {
                ids[row.id] = true;
            }
        });
        var cid = postCid();
        readLocalHistory().forEach(function (row) {
            if (!row || !row.snapshot || ids[row.id]) {
                return;
            }
            if (String(row.cid) !== cid && !(cid === '0' && (!row.cid || row.cid === '0'))) {
                return;
            }
            editor.push({
                id: row.id,
                snapshot: row.snapshot,
                inEditor: false,
                local: true,
                savedAt: row.savedAt || 0
            });
        });
        return editor;
    }

    function updateHistStatus() {
        var $el = $('#as-hist-status');
        if (!$el.length) {
            return;
        }
        if (!replaceOnInsert || !activeId) {
            $el.prop('hidden', true).empty();
            return;
        }
        $el.prop('hidden', false).html(
            '已加载历史，再次插入将<strong>替换</strong>正文中的原块。'
            + '<button type="button" class="btn btn-xs" id="as-hist-as-new">改为新插入</button>'
        );
    }

    function renderHistory() {
        var $list = $('#as-hist-list');
        var $empty = $('#as-hist-empty');
        var $count = $('#as-hist-count');
        if (!$list.length) {
            return;
        }
        historyView = collectHistoryView();
        $count.text(String(historyView.length));
        if (!historyView.length) {
            $list.empty();
            $empty.prop('hidden', false);
            updateHistStatus();
            return;
        }
        $empty.prop('hidden', true);
        var html = '';
        historyView.forEach(function (row, i) {
            var snap = row.snapshot || {};
            var thumb = snapshotThumb(snap);
            var on = row.id && row.id === activeId && replaceOnInsert ? ' is-on' : '';
            var badge = row.inEditor ? '正文' : '本地';
            var when = formatHistTime(row.savedAt);
            html += '<div class="as-hist-card' + on + '" data-hist="' + i + '" data-id="' + escapeHtml(row.id || '') + '">'
                + '<span class="as-hist-thumb">'
                + (thumb ? '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy">' : '<span class="as-hist-ph">文</span>')
                + '</span>'
                + '<span class="as-hist-meta">'
                + '<span class="as-hist-title">' + escapeHtml(snapshotLabel(snap)) + '</span>'
                + '<span class="as-hist-sub">' + escapeHtml(badge + (when ? ' · ' + when : '')) + '</span>'
                + '</span>'
                + (row.local && !row.inEditor
                    ? '<button type="button" class="as-hist-del" data-del="' + escapeHtml(row.id || '') + '" title="删除本地记录">×</button>'
                    : '<span></span>')
                + '</div>';
        });
        $list.html(html);
        updateHistStatus();
    }

    function applySnapshot(snap, rec) {
        if (!snap) {
            return;
        }
        loadingSnap = true;
        activeId = snap.id || (rec && rec.id) || newRecordId();
        replaceOnInsert = !!(rec && (rec.inEditor || rec.raw));
        replaceNeedle = (rec && rec.raw) || '';
        items = Array.isArray(snap.items) ? JSON.parse(JSON.stringify(snap.items)) : [];
        selected = 0;
        $('#as-cat').val(snap.cat || (items.length ? 'canvas' : 'single'));
        syncUi();
        if (snap.preset) {
            $('#as-preset').val(snap.preset);
        }
        if (snap.ratio) {
            $('#as-ratio').val(snap.ratio);
        }
        if (snap.ratioW) {
            $('#as-ratio-w').val(snap.ratioW);
        }
        if (snap.ratioH) {
            $('#as-ratio-h').val(snap.ratioH);
        }
        if (snap.layout) {
            $('#as-layout').val(snap.layout);
        }
        if (snap.pos) {
            $('#as-pos').val(snap.pos);
        }
        if (snap.titlepos) {
            $('#as-titlepos').val(snap.titlepos);
        }
        $('#as-wrap').prop('checked', !!snap.wrap);
        $('#as-alt').val(snap.alt || '');
        $('#as-src').val(snap.src || '');
        syncUi();
        loadingSnap = false;
        if (window.CI_refreshPreview) {
            window.CI_refreshPreview();
        }
        window.setTimeout(function () {
            paintBoard();
            renderLibrary();
            renderHistory();
            bindDropZone();
        }, 0);
    }

    function buildBoardHtml() {
        if (!activeId) {
            activeId = newRecordId();
        }
        var ratio = currentRatio();
        var ratioCssVal = ratio.replace(':', ' / ');
        var draft = encodeDraft(captureSnapshot());
        var html = '<div class="album-board" data-ratio="' + escapeHtml(ratio) + '" data-as-id="' + escapeHtml(activeId) + '"'
            + (draft ? ' data-as-draft="' + draft + '"' : '') + '>'
            + '<div class="album-board-stage" style="position:relative;width:100%;aspect-ratio:' + escapeHtml(ratioCssVal)
            + ';overflow:hidden;container-type:inline-size;--board-ratio:' + escapeHtml(ratioCssVal) + '">';
        items.forEach(function (it) {
            if (isTextItem(it)) {
                ensureText(it);
                var shadow = it.shadow
                    ? 'text-shadow:0 1px 3px rgba(0,0,0,.55),0 0 12px rgba(0,0,0,.25);'
                    : '';
                var text = escapeHtml(it.text || '').replace(/\n/g, '<br>');
                var tbox = 'position:absolute;left:' + it.x + '%;top:' + it.y + '%;width:' + it.w + '%;height:' + it.h + '%;'
                    + 'z-index:3;overflow:hidden;margin:0;padding:0.3em 0.4em;box-sizing:border-box;'
                    + 'color:' + escapeHtml(it.color) + ';text-align:' + escapeHtml(it.align) + ';font-weight:' + escapeHtml(String(it.weight)) + ';'
                    + 'font-size:calc(' + it.fs + ' * 1cqw);line-height:1.35;white-space:pre-wrap;word-break:break-word;'
                    + shadow;
                html += '<div class="album-board-text" style="' + tbox + '">' + text + '</div>';
                return;
            }
            if (!isUsableUrl(it.src)) {
                return;
            }
            ensureCrop(it);
            var box = 'position:absolute;left:' + it.x + '%;top:' + it.y + '%;width:' + it.w + '%;height:' + it.h + '%;'
                + 'overflow:hidden;margin:0;padding:0;--ox:' + it.ox + '%;--oy:' + it.oy + '%;--zoom:' + it.zoom + ';';
            var imgStyle = 'width:100%;height:100%;max-height:none;object-fit:cover;object-position:' + it.ox + '% ' + it.oy + '%;'
                + 'transform:scale(' + it.zoom + ');transform-origin:' + it.ox + '% ' + it.oy + '%;display:block;';
            html += '<figure class="album-board-item is-crop" style="' + box + '">'
                + '<a data-fancybox="gallery" href="' + escapeHtml(it.src) + '" data-caption="' + escapeHtml(it.alt || '')
                + '" style="display:block;width:100%;height:100%;line-height:0">'
                + '<img src="' + escapeHtml(it.src) + '" alt="' + escapeHtml(it.alt || '') + '" style="' + imgStyle + '">'
                + '</a></figure>';
        });
        html += '</div></div>';
        return html;
    }

    function buildShortcode() {
        if (!isBoardMode()) {
            var src = currentSrc();
            if (!src) {
                window.alert('请从右侧附件库选择或拖入一张图片');
                return '';
            }
            if (!isUsableUrl(src)) {
                window.alert('图片 URL 无效，请重新从附件库选用');
                return '';
            }
            var layout = $('#as-layout').val() || 'auto';
            var parts = ['layout="' + escapeAttr(layout) + '"', 'src="' + escapeAttr(src) + '"'];
            var alt = $.trim($('#as-alt').val());
            if (alt) parts.push('alt="' + escapeAttr(alt) + '"');
            if (layout === 'custom') {
                parts.push('pos="' + escapeAttr($('#as-pos').val() || 'top') + '"');
                parts.push('titlepos="' + escapeAttr($('#as-titlepos').val() || 'above') + '"');
                if ($('#as-wrap').prop('checked')) parts.push('wrap="1"');
            }
            return wrapForMarkdown('[album-shot ' + parts.join(' ') + ']');
        }
        if (items.length < 1) {
            window.alert('请至少加入一张图片或一段文字');
            return '';
        }
        // 直接插入与前台一致的 HTML，避免 [img][img] 被 HyperDown 当成引用链接拆成上下叠图
        return wrapForMarkdown(buildBoardHtml());
    }

    function pctFromEvent(e, $board) {
        var rect = $board[0].getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100
        };
    }

    function setDropHighlight(on) {
        $('#ci-preview, .ci-preview-stage, .as-drop-stage, #as-board')
            .toggleClass('as-drop-over', !!on);
    }

    function bindDropZone() {
        var $stage = $('#ci-preview').closest('.ci-preview-stage');
        if (!$stage.length) {
            $stage = $('#ci-preview');
        }
        $stage.attr('data-as-drop', '1');
    }

    window.CI_HANDLERS = window.CI_HANDLERS || {};
    window.CI_HANDLERS['album-shot'] = {
        onShow: function () {
            refreshLibrary();
            renderHistory();
            syncUi();
            bindDropZone();
        },
        preview: function () {
            if (isBoardMode()) {
                if (!$('#as-board').length) {
                    window.setTimeout(function () {
                        paintBoard();
                        bindDropZone();
                        syncUi();
                    }, 0);
                    return boardEditorHtml();
                }
                applyBoardRatio();
                paintBoard();
                return false;
            }
            window.setTimeout(bindDropZone, 0);
            return singlePreviewHtml();
        },
        insert: function (done) {
            if (!replaceOnInsert || !activeId) {
                activeId = newRecordId();
                replaceNeedle = '';
                replaceOnInsert = false;
            }
            var inner = buildShortcode();
            if (!inner) {
                return;
            }
            persistHistory();
            var payload = wrapRecord(inner, activeId);
            if (writeOrReplace(payload, activeId)) {
                replaceOnInsert = false;
                replaceNeedle = '';
                renderHistory();
                done();
            }
        }
    };

    $(function () {
        mergeLibrary();

        $(document).on('change', '#as-cat, #as-preset, #as-ratio, #as-layout, #as-pos, #as-titlepos, #as-wrap, #as-alt', function () {
            var id = this.id;
            if (loadingSnap) {
                return;
            }
            if (id === 'as-cat') {
                syncUi();
                if (isBoardMode() && items.length && cat() !== 'canvas') {
                    applyPreset($('#as-preset').val());
                }
            } else if (id === 'as-preset') {
                applyPreset($(this).val());
            } else if (id === 'as-ratio') {
                var v = $('#as-ratio').val() || '';
                if (v !== 'custom' && v.indexOf(':') !== -1) {
                    var parts = v.split(':');
                    $('#as-ratio-w').val(parts[0]);
                    $('#as-ratio-h').val(parts[1]);
                }
                syncUi();
            } else if (id === 'as-layout' || id === 'as-pos' || id === 'as-titlepos' || id === 'as-wrap') {
                syncUi();
            }
            if (window.CI_refreshPreview) {
                window.CI_refreshPreview();
            } else if (isBoardMode()) {
                applyBoardRatio();
                paintBoard();
            }
            window.setTimeout(function () {
                applyBoardRatio();
                paintBoard();
                renderLibrary();
                syncUi();
            }, 0);
        });

        $(document).on('input change', '#as-ratio-w, #as-ratio-h', function () {
            if (($('#as-ratio').val() || '') !== 'custom') {
                $('#as-ratio').val('custom');
                syncUi();
            }
            applyBoardRatio();
        });

        $(document).on('click', '.as-board-remove', function (e) {
            e.preventDefault();
            e.stopPropagation();
            removeItem(parseInt($(this).attr('data-remove'), 10));
        });

        $(document).on('keydown', function (e) {
            if ($('#ci-inserter-modal').prop('hidden') || $('#ci-panel-album-shot').prop('hidden')) {
                return;
            }
            if (!isBoardMode() || !items.length) {
                return;
            }
            var tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                removeItem(selected);
            }
        });

        $(document).on('click', '#as-add-text', function (e) {
            e.preventDefault();
            addText();
        });

        $(document).on('click', '.as-hist-card', function (e) {
            if ($(e.target).closest('.as-hist-del').length) {
                return;
            }
            var i = parseInt($(this).attr('data-hist'), 10);
            var rec = historyView[i];
            if (!rec || !rec.snapshot) {
                return;
            }
            applySnapshot(rec.snapshot, rec);
        });

        $(document).on('click', '.as-hist-del', function (e) {
            e.preventDefault();
            e.stopPropagation();
            removeLocalHistory($(this).attr('data-del') || '');
        });

        $(document).on('click', '#as-hist-as-new', function (e) {
            e.preventDefault();
            replaceOnInsert = false;
            replaceNeedle = '';
            activeId = newRecordId();
            updateHistStatus();
            renderHistory();
        });

        $(document).on('input change', '#as-text-fs, #as-text-color, #as-text-align, #as-text-bold, #as-text-shadow', function () {
            applyTextBar();
        });

        $(document).on('dblclick', '.as-board-text-body', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var i = parseInt(this.getAttribute('data-i'), 10);
            if (!items[i] || !isTextItem(items[i])) {
                return;
            }
            selected = i;
            editingText = i;
            drag = null;
            this.contentEditable = 'true';
            this.focus();
            try {
                var range = document.createRange();
                range.selectNodeContents(this);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (err) {}
            syncTextBar();
        });

        $(document).on('blur', '.as-board-text-body', function () {
            var i = parseInt(this.getAttribute('data-i'), 10);
            if (!items[i] || !isTextItem(items[i])) {
                return;
            }
            var text = String(this.innerText || '').replace(/\u00a0/g, ' ');
            items[i].text = $.trim(text) || '双击编辑文字';
            this.contentEditable = 'false';
            editingText = -1;
        });

        $(document).on('keydown', '.as-board-text-body', function (e) {
            e.stopPropagation();
            if (e.key === 'Escape') {
                this.blur();
                e.preventDefault();
            }
        });

        $(document).on('click', '#as-lib-refresh', function (e) {
            e.preventDefault();
            refreshLibrary();
        });

        $(document).on('click', '#as-board-clear', function () {
            items = [];
            paintBoard();
            renderLibrary();
        });

        $(document).on('click', '.as-lib-card', function (e) {
            e.preventDefault();
            applyImage($(this).attr('data-url') || '');
        });

        $(document).on('dragstart', '.as-lib-card', function (e) {
            libDragUrl = $(this).attr('data-url') || '';
            $(this).addClass('is-dragging');
            try {
                e.originalEvent.dataTransfer.setData('text/plain', libDragUrl);
                e.originalEvent.dataTransfer.effectAllowed = 'copy';
            } catch (err) {}
        });

        $(document).on('dragend', '.as-lib-card', function () {
            $(this).removeClass('is-dragging');
            libDragUrl = '';
            setDropHighlight(false);
        });

        $(document).on('dragover', '#ci-preview, .ci-preview-stage, .as-drop-stage, #as-board', function (e) {
            if (!$('#ci-panel-album-shot').length || $('#ci-panel-album-shot').prop('hidden')) {
                return;
            }
            e.preventDefault();
            try {
                e.originalEvent.dataTransfer.dropEffect = 'copy';
            } catch (err) {}
            setDropHighlight(true);
        });

        $(document).on('dragleave', '#ci-preview, .ci-preview-stage, .as-drop-stage, #as-board', function (e) {
            var related = e.relatedTarget;
            if (related && this.contains && this.contains(related)) {
                return;
            }
            setDropHighlight(false);
        });

        $(document).on('drop', '#ci-preview, .ci-preview-stage, .as-drop-stage, #as-board', function (e) {
            if (!$('#ci-panel-album-shot').length || $('#ci-panel-album-shot').prop('hidden')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            setDropHighlight(false);
            var url = libDragUrl;
            try {
                url = url || e.originalEvent.dataTransfer.getData('text/plain') || '';
            } catch (err) {}
            applyImage($.trim(url));
        });

        $(document).on('mousedown', '.as-board-item', function (e) {
            if ($(e.target).closest('.as-board-handle, .as-board-remove, .as-board-move').length) {
                return;
            }
            if ($(e.target).closest('.as-board-text-body[contenteditable="true"]').length) {
                return;
            }
            var i = parseInt($(this).data('i'), 10);
            if (!items[i]) {
                return;
            }
            selected = i;
            $('.as-board-item').removeClass('is-on');
            $(this).addClass('is-on');
            syncTextBar();
            var rect = this.getBoundingClientRect();
            var mode = isTextItem(items[i]) ? 'move' : ((e.altKey || e.shiftKey) ? 'move' : 'crop');
            if (mode === 'move') {
                var start = pctFromEvent(e, $('#as-board'));
                drag = {
                    mode: 'move',
                    i: i,
                    ox: start.x - items[i].x,
                    oy: start.y - items[i].y
                };
            } else {
                ensureCrop(items[i]);
                drag = {
                    mode: 'crop',
                    i: i,
                    startX: e.clientX,
                    startY: e.clientY,
                    startOx: items[i].ox,
                    startOy: items[i].oy,
                    elW: Math.max(rect.width, 1),
                    elH: Math.max(rect.height, 1)
                };
            }
            e.preventDefault();
        });

        $(document).on('mousedown', '.as-board-move', function (e) {
            var i = parseInt($(this).attr('data-move'), 10);
            if (!items[i]) {
                return;
            }
            selected = i;
            $('.as-board-item').removeClass('is-on');
            $(this).closest('.as-board-item').addClass('is-on');
            syncTextBar();
            var start = pctFromEvent(e, $('#as-board'));
            drag = {
                mode: 'move',
                i: i,
                ox: start.x - items[i].x,
                oy: start.y - items[i].y
            };
            e.preventDefault();
            e.stopPropagation();
        });

        $(document).on('mousedown', '.as-board-handle', function (e) {
            var i = parseInt($(this).data('resize'), 10);
            if (!items[i]) {
                return;
            }
            selected = i;
            if (!isTextItem(items[i])) {
                ensureCrop(items[i]);
            }
            $('.as-board-item').removeClass('is-on');
            $(this).closest('.as-board-item').addClass('is-on');
            syncTextBar();
            drag = {
                mode: 'resize',
                i: i,
                startW: items[i].w,
                startH: items[i].h,
                startX: e.clientX,
                startY: e.clientY
            };
            e.preventDefault();
            e.stopPropagation();
        });

        $(document).on('mousedown', '.as-board-ratio-handle', function (e) {
            var board = document.getElementById('as-board');
            if (!board) {
                return;
            }
            var rect = board.getBoundingClientRect();
            if (($('#as-ratio').val() || '') !== 'custom') {
                $('#as-ratio').val('custom');
                syncUi();
            }
            drag = {
                mode: 'ratio',
                startY: e.clientY,
                startH: rect.height,
                boxW: Math.max(rect.width, 1),
                wPart: roundRatio($('#as-ratio-w').val()) || 3
            };
            e.preventDefault();
            e.stopPropagation();
        });

        $(document).on('mousemove', function (e) {
            if (!drag) {
                return;
            }
            if (drag.mode === 'ratio') {
                var dy = e.clientY - drag.startY;
                var newH = clamp(drag.startH + dy, drag.boxW * 0.28, drag.boxW * 2.4);
                var hPart = roundRatio(drag.wPart * newH / drag.boxW);
                if (hPart < 0.1) {
                    hPart = 0.1;
                }
                $('#as-ratio-h').val(hPart);
                applyBoardRatio();
                return;
            }
            if (!items[drag.i]) {
                return;
            }
            var it = items[drag.i];
            var $board = $('#as-board');
            if (!$board.length) {
                return;
            }
            if (drag.mode === 'move') {
                var p = pctFromEvent(e, $board);
                it.x = clamp(Math.round(p.x - drag.ox), 0, 88);
                it.y = clamp(Math.round(p.y - drag.oy), 0, 88);
            } else if (drag.mode === 'crop') {
                var dx = e.clientX - drag.startX;
                var dy = e.clientY - drag.startY;
                var factor = 100 / Math.max(it.zoom || 1, 1);
                it.ox = clamp(Math.round(drag.startOx - (dx / drag.elW) * factor), 0, 100);
                it.oy = clamp(Math.round(drag.startOy - (dy / drag.elH) * factor), 0, 100);
            } else {
                var bw = Math.max($board.width(), 1);
                var bh = Math.max($board.height(), 1);
                var dw = (e.clientX - drag.startX) / bw * 100;
                var dh = (e.clientY - drag.startY) / bh * 100;
                var minSize = isTextItem(it) ? 8 : 12;
                it.w = clamp(Math.round(drag.startW + dw), minSize, 96);
                it.h = clamp(Math.round(drag.startH + dh), minSize, 96);
            }
            syncBoardFrame(drag.i);
        });

        $(document).on('mouseup', function () {
            drag = null;
        });

        if (document.addEventListener) {
            document.addEventListener('wheel', function (e) {
                var item = e.target && e.target.closest ? e.target.closest('.as-board-item') : null;
                if (!item || !document.getElementById('as-board')) {
                    return;
                }
                if ($('#ci-inserter-modal').prop('hidden') || $('#ci-panel-album-shot').prop('hidden')) {
                    return;
                }
                var i = parseInt(item.getAttribute('data-i'), 10);
                if (!items[i]) {
                    return;
                }
                if (isTextItem(items[i])) {
                    if (editingText === i) {
                        return;
                    }
                    e.preventDefault();
                    selected = i;
                    ensureText(items[i]);
                    var tDelta = e.deltaY > 0 ? -0.3 : 0.3;
                    items[i].fs = Math.round(clamp(items[i].fs + tDelta, 1.5, 16) * 10) / 10;
                    $('.as-board-item').removeClass('is-on');
                    $(item).addClass('is-on');
                    syncBoardFrame(i);
                    syncTextBar();
                    return;
                }
                e.preventDefault();
                selected = i;
                ensureCrop(items[i]);
                var delta = e.deltaY > 0 ? -0.08 : 0.08;
                items[i].zoom = Math.round(clamp(items[i].zoom + delta, 1, 3) * 100) / 100;
                $('.as-board-item').removeClass('is-on');
                $(item).addClass('is-on');
                syncBoardFrame(i);
            }, { passive: false });
        }

        // 上传完成后自动刷新图库
        if (window.MutationObserver && document.body) {
            var libObserver = new MutationObserver(function () {
                window.clearTimeout(window.__asLibTimer);
                window.__asLibTimer = window.setTimeout(refreshLibrary, 400);
            });
            var watchList = function () {
                var el = document.getElementById('file-list');
                if (el) {
                    libObserver.observe(el, { childList: true, subtree: true });
                }
            };
            watchList();
            var panel = document.getElementById('upload-panel');
            if (panel) {
                libObserver.observe(panel, { childList: true, subtree: false });
                window.setTimeout(watchList, 0);
            }
        }
    });
})(window.jQuery);
