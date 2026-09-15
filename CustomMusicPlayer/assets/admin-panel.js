(function ($) {
    'use strict';

    var bootRoot = window.CI_BOOT || {};
    var boot = (bootRoot.components && bootRoot.components.music) || {};
    var defaultHint = boot.defaultHint || '点按唱片播放 · 拖动外环调节进度';

    function escapeHtml(v) { return window.CI_escapeHtml ? window.CI_escapeHtml(v) : String(v || ''); }
    function escapeAttr(v) { return window.CI_escapeAttr ? window.CI_escapeAttr(v) : String(v || ''); }

    function extractPlatformId(input, source) {
        var raw = String(input || '').trim();
        if (!raw) return '';
        if (/^\d+$/.test(raw)) return raw;
        var m;
        if (source === 'netease') {
            m = raw.match(/[?&#]id=(\d+)/i) || raw.match(/song\/(\d+)/i) || raw.match(/(\d{5,})/);
        } else if (source === 'tencent') {
            m = raw.match(/[?&#]songmid=([a-zA-Z0-9]+)/i)
                || raw.match(/[?&#]id=(\d+)/i)
                || raw.match(/songDetail\/(\d+)/i)
                || raw.match(/(\d{5,})/);
        } else {
            m = raw.match(/(\d{5,})/);
        }
        return m ? m[1] : '';
    }

    function buildMetingUrl(server, type, id) {
        var tpl = boot.metingApi || 'https://meting.mikus.ink/api?server=:server&type=:type&id=:id';
        return tpl
            .replace(':server', encodeURIComponent(server))
            .replace(':type', encodeURIComponent(type))
            .replace(':id', encodeURIComponent(id));
    }

    function isAudioUrl(url, name) {
        var s = ((url || '') + ' ' + (name || '')).toLowerCase();
        return /\.(mp3|m4a|ogg|wav|flac)(\?|#|$)/i.test(s) || /audio\//i.test(s);
    }

    function isImageUrl(url, name) {
        var s = ((url || '') + ' ' + (name || '')).toLowerCase();
        return /\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i.test(s) || /image\//i.test(s);
    }

    function collectAttachments() {
        var audio = [];
        var images = [];
        $('#file-list li').each(function () {
            var $li = $(this);
            var $insert = $li.find('a.insert').first();
            if (!$insert.length) return;
            var url = $insert.attr('href') || $insert.data('url') || '';
            var name = $.trim($insert.text()) || $li.text();
            if (!url || url.indexOf('javascript:') === 0) {
                var $url = $li.find('input[name="attachment[]"], .url, code').first();
                if ($url.length) url = $url.val() || $url.text() || '';
            }
            if ((!url || url.indexOf('javascript:') === 0) && $insert.attr('onclick')) {
                var m = $insert.attr('onclick').match(/['"](https?:\/\/[^'"]+|\/[^'"]+)['"]/);
                if (m) url = m[1];
            }
            if (!url || url.indexOf('javascript:') === 0) return;
            var item = { url: url, name: name };
            if (isAudioUrl(url, name)) audio.push(item);
            else if (isImageUrl(url, name)) images.push(item);
        });
        return { audio: audio, images: images };
    }

    function fillAttachmentSelects() {
        var data = collectAttachments();
        var $src = $('#cmp-src-pick').empty().append('<option value="">— 从已上传附件选择音频 —</option>');
        var $cover = $('#cmp-cover-pick').empty().append('<option value="">— 从已上传附件选择封面 —</option>');
        data.audio.forEach(function (item) {
            $src.append($('<option></option>').val(item.url).text(item.name));
        });
        data.images.forEach(function (item) {
            $cover.append($('<option></option>').val(item.url).text(item.name));
        });
    }

    function syncSourcePanels() {
        var source = $('#cmp-source').val() || 'custom';
        var isCustom = source === 'custom';
        $('#cmp-panel-custom').prop('hidden', !isCustom);
        $('#cmp-panel-platform').prop('hidden', isCustom);
        $('.cmp-req-title').toggle(isCustom);
        if (!isCustom) $('#cmp-resolve-status').text('');
    }

    function resolvePlatformTrack() {
        var source = $('#cmp-source').val();
        var id = extractPlatformId($('#cmp-platform-id').val(), source);
        var $status = $('#cmp-resolve-status');
        if (!id) {
            $status.text('请填写有效的歌曲 ID 或链接');
            return $.Deferred().reject().promise();
        }
        $status.text('解析中…');
        return $.ajax({
            url: buildMetingUrl(source, 'song', id),
            dataType: 'json',
            timeout: 12000
        }).then(function (data) {
            var item = Array.isArray(data) ? data[0] : data;
            if (!item) throw new Error('empty');
            var title = item.title || item.name || '';
            var artist = item.author || item.artist || '';
            if (Array.isArray(artist)) artist = artist.join(' / ');
            var cover = item.pic || item.cover || '';
            var src = item.url || '';
            if (title) $('#cmp-title').val(title);
            if (artist) $('#cmp-artist').val(artist);
            if (cover) $('#cmp-cover').val(cover);
            if (src) $('#cmp-src').val(src);
            $('#cmp-platform-id').val(id);
            $status.text('已解析：' + (title || id));
            return { from: source, id: id, title: title, artist: artist, cover: cover, src: src };
        }, function () {
            $status.text('解析失败，请检查 ID 或插件 Meting API');
        });
    }

    function effectiveHint() {
        var h = $.trim($('#cmp-hint').val());
        return h !== '' ? h : defaultHint;
    }

    function buildShortcode(data) {
        var parts = ['[music'];
        if (data.from && data.from !== 'custom') {
            parts.push('from="' + escapeAttr(data.from) + '"');
            parts.push('id="' + escapeAttr(data.id) + '"');
            if (data.title) parts.push('title="' + escapeAttr(data.title) + '"');
            if (data.artist) parts.push('artist="' + escapeAttr(data.artist) + '"');
            if (data.cover) parts.push('cover="' + escapeAttr(data.cover) + '"');
        } else {
            parts.push('title="' + escapeAttr(data.title) + '"');
            if (data.artist) parts.push('artist="' + escapeAttr(data.artist) + '"');
            parts.push('src="' + escapeAttr(data.src) + '"');
            if (data.cover) parts.push('cover="' + escapeAttr(data.cover) + '"');
        }
        parts.push('mode="' + escapeAttr(data.mode || 'click') + '"');
        if (data.notice) parts.push('notice="1"');
        if (data.hint) parts.push('hint="' + escapeAttr(data.hint) + '"');
        return parts.join(' ') + ']';
    }

    function previewHtml() {
        var title = $.trim($('#cmp-title').val()) || '歌曲名';
        var artist = $.trim($('#cmp-artist').val()) || '艺术家';
        var hint = effectiveHint();
        return (
            '<div class="ci-music-preview">' +
            '<div class="ci-music-preview-disc" aria-hidden="true"></div>' +
            '<div class="ci-music-preview-meta">' +
            '<strong>' + escapeHtml(title) + '</strong>' +
            '<span>' + escapeHtml(artist) + '</span>' +
            (hint ? '<span class="ci-music-preview-hint">' + escapeHtml(hint) + '</span>' : '') +
            '</div></div>'
        );
    }

    function doInsert(meta, done) {
        var source = $('#cmp-source').val() || 'custom';
        var mode = $('#cmp-mode').val() || 'click';
        var notice = $('#cmp-notice').is(':checked');
        var hintRaw = $.trim($('#cmp-hint').val());
        var payload = {
            from: source,
            mode: mode,
            notice: notice,
            hint: hintRaw
        };
        if (source === 'custom') {
            payload.title = $.trim($('#cmp-title').val());
            payload.artist = $.trim($('#cmp-artist').val());
            payload.src = $.trim($('#cmp-src').val());
            payload.cover = $.trim($('#cmp-cover').val());
        } else {
            payload.id = extractPlatformId($('#cmp-platform-id').val(), source);
            payload.title = meta && meta.title ? meta.title : $.trim($('#cmp-title').val());
            payload.artist = meta && meta.artist ? meta.artist : $.trim($('#cmp-artist').val());
            payload.cover = meta && meta.cover ? meta.cover : $.trim($('#cmp-cover').val());
        }
        if (window.CI_insertIntoEditor(buildShortcode(payload))) {
            done();
        }
    }

    window.CI_HANDLERS = window.CI_HANDLERS || {};
    window.CI_HANDLERS.music = {
        onShow: function () {
            $('#cmp-hint').attr('placeholder', defaultHint || '留空则使用插件默认备注');
            fillAttachmentSelects();
            syncSourcePanels();
            $('#cmp-notice').prop('checked', true);
        },
        preview: previewHtml,
        insert: function (done) {
            var source = $('#cmp-source').val() || 'custom';
            if (source === 'custom') {
                if (!$.trim($('#cmp-title').val())) {
                    window.alert('请填写歌曲名');
                    return;
                }
                if (!$.trim($('#cmp-src').val())) {
                    window.alert('请填写音频 URL，或从附件选择');
                    return;
                }
                doInsert({}, done);
                return;
            }
            var id = extractPlatformId($('#cmp-platform-id').val(), source);
            if (!id) {
                window.alert('请填写网易云/QQ 音乐歌曲 ID 或分享链接');
                return;
            }
            if ($.trim($('#cmp-title').val()) && $('#cmp-platform-id').val() === id) {
                doInsert({
                    title: $.trim($('#cmp-title').val()),
                    artist: $.trim($('#cmp-artist').val()),
                    cover: $.trim($('#cmp-cover').val())
                }, done);
                return;
            }
            resolvePlatformTrack().then(function (meta) {
                doInsert(meta || {}, done);
            });
        }
    };

    $(function () {
        if (!$('#ci-music-preview-style').length) {
            $('head').append(
                '<style id="ci-music-preview-style">' +
                '.ci-music-preview{display:flex;gap:12px;align-items:center;}' +
                '.ci-music-preview-disc{width:56px;height:56px;border-radius:50%;' +
                'background:radial-gradient(circle at 50% 50%,#333 18%,#111 19%,#222 42%,#000 43%,#444 70%,#111 71%);flex-shrink:0;}' +
                '.ci-music-preview-meta{display:flex;flex-direction:column;gap:4px;font-size:13px;}' +
                '.ci-music-preview-hint{color:#888;font-size:12px;}' +
                '</style>'
            );
        }

        $('#cmp-hint').attr('placeholder', defaultHint || '留空则使用插件默认备注');

        $(document).on('change', '#cmp-source', function () {
            syncSourcePanels();
            if (window.CI_refreshPreview) window.CI_refreshPreview();
        });
        $(document).on('change', '#cmp-src-pick', function () {
            var v = $(this).val();
            if (v) $('#cmp-src').val(v);
            if (window.CI_refreshPreview) window.CI_refreshPreview();
        });
        $(document).on('change', '#cmp-cover-pick', function () {
            var v = $(this).val();
            if (v) $('#cmp-cover').val(v);
        });
        $(document).on('click', '#cmp-resolve-btn', function (e) {
            e.preventDefault();
            resolvePlatformTrack().then(function () {
                if (window.CI_refreshPreview) window.CI_refreshPreview();
            });
        });
        $(document).on(
            'input change',
            '#cmp-title,#cmp-artist,#cmp-mode,#cmp-notice,#cmp-hint',
            function () {
                if (window.CI_refreshPreview) window.CI_refreshPreview();
            }
        );

        var fileList = document.getElementById('file-list');
        if (fileList && window.MutationObserver) {
            new MutationObserver(function () {
                if (!$('#ci-inserter-modal').prop('hidden') && $('#ci-component').val() === 'music') {
                    fillAttachmentSelects();
                }
            }).observe(fileList, { childList: true, subtree: true });
        }
    });
})(window.jQuery);
