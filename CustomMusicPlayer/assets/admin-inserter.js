(function ($) {
    'use strict';

    function escapeAttr(value) {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    }

    function extractPlatformId(input, source) {
        var raw = String(input || '').trim();
        if (!raw) {
            return '';
        }
        if (/^\d+$/.test(raw)) {
            return raw;
        }

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
        var tpl = window.CMP_METING_API || 'https://meting.mikus.ink/api?server=:server&type=:type&id=:id';
        return tpl
            .replace(':server', encodeURIComponent(server))
            .replace(':type', encodeURIComponent(type))
            .replace(':id', encodeURIComponent(id));
    }

    function buildShortcode(data) {
        var parts = ['[music'];
        if (data.from && data.from !== 'custom') {
            parts.push('from="' + escapeAttr(data.from) + '"');
            parts.push('id="' + escapeAttr(data.id) + '"');
            if (data.title) {
                parts.push('title="' + escapeAttr(data.title) + '"');
            }
            if (data.artist) {
                parts.push('artist="' + escapeAttr(data.artist) + '"');
            }
            if (data.cover) {
                parts.push('cover="' + escapeAttr(data.cover) + '"');
            }
        } else {
            parts.push('title="' + escapeAttr(data.title) + '"');
            if (data.artist) {
                parts.push('artist="' + escapeAttr(data.artist) + '"');
            }
            parts.push('src="' + escapeAttr(data.src) + '"');
            if (data.cover) {
                parts.push('cover="' + escapeAttr(data.cover) + '"');
            }
        }
        parts.push('mode="' + escapeAttr(data.mode || 'click') + '"');
        if (data.notice) {
            parts.push('notice="1"');
        }
        return parts.join(' ') + ']';
    }

    function insertIntoEditor(text) {
        var textarea = document.getElementById('text');
        if (!textarea) {
            window.alert('未找到正文编辑框');
            return false;
        }

        textarea.focus();
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var value = textarea.value;
        var before = value.substring(0, start);
        var after = value.substring(end);
        var needsNlBefore = before.length && !/\n$/.test(before);
        var needsNlAfter = after.length && !/^\n/.test(after);
        var chunk = (needsNlBefore ? '\n' : '') + text + (needsNlAfter ? '\n' : '');
        textarea.value = before + chunk + after;
        var caret = (before + chunk).length;
        textarea.selectionStart = textarea.selectionEnd = caret;

        if (typeof $ !== 'undefined') {
            $(textarea).trigger('input').trigger('change');
        }
        return true;
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
            if (!$insert.length) {
                return;
            }
            var url = $insert.attr('href') || $insert.data('url') || '';
            var name = $.trim($insert.text()) || $li.text();
            if (!url || url.indexOf('javascript:') === 0) {
                var $url = $li.find('input[name="attachment[]"], .url, code').first();
                if ($url.length) {
                    url = $url.val() || $url.text() || '';
                }
            }
            if ((!url || url.indexOf('javascript:') === 0) && $insert.attr('onclick')) {
                var m = $insert.attr('onclick').match(/['"](https?:\/\/[^'"]+|\/[^'"]+)['"]/);
                if (m) {
                    url = m[1];
                }
            }
            if (!url || url.indexOf('javascript:') === 0) {
                return;
            }
            var item = { url: url, name: name };
            if (isAudioUrl(url, name)) {
                audio.push(item);
            } else if (isImageUrl(url, name)) {
                images.push(item);
            }
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
        if (!isCustom) {
            $('#cmp-resolve-status').text('');
        }
    }

    function openModal() {
        fillAttachmentSelects();
        $('#cmp-notice').prop('checked', true);
        syncSourcePanels();
        $('#cmp-inserter-modal').prop('hidden', false);
        var source = $('#cmp-source').val();
        if (source === 'custom') {
            $('#cmp-title').trigger('focus');
        } else {
            $('#cmp-platform-id').trigger('focus');
        }
    }

    function closeModal() {
        $('#cmp-inserter-modal').prop('hidden', true);
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
        var url = buildMetingUrl(source, 'song', id);

        return $.ajax({
            url: url,
            dataType: 'json',
            timeout: 12000
        }).then(function (data) {
            var item = Array.isArray(data) ? data[0] : data;
            if (!item) {
                throw new Error('empty');
            }
            var title = item.title || item.name || '';
            var artist = item.author || item.artist || '';
            if (Array.isArray(artist)) {
                artist = artist.join(' / ');
            }
            var cover = item.pic || item.cover || '';
            var src = item.url || '';

            if (title) {
                $('#cmp-title').val(title);
            }
            if (artist) {
                $('#cmp-artist').val(artist);
            }
            if (cover) {
                $('#cmp-cover').val(cover);
            }
            if (src) {
                $('#cmp-src').val(src);
            }
            $('#cmp-platform-id').val(id);
            $status.text('已解析：' + (title || id));
            return {
                from: source,
                id: id,
                title: title,
                artist: artist,
                cover: cover,
                src: src
            };
        }, function () {
            $status.text('解析失败，请检查 ID 或插件 Meting API');
        });
    }

    $(function () {
        $(document).on('click', '#cmp-open-inserter', function (e) {
            e.preventDefault();
            openModal();
        });

        $(document).on('click', '[data-cmp-close]', function (e) {
            e.preventDefault();
            closeModal();
        });

        $(document).on('change', '#cmp-source', syncSourcePanels);

        $(document).on('change', '#cmp-src-pick', function () {
            var v = $(this).val();
            if (v) {
                $('#cmp-src').val(v);
            }
        });

        $(document).on('change', '#cmp-cover-pick', function () {
            var v = $(this).val();
            if (v) {
                $('#cmp-cover').val(v);
            }
        });

        $(document).on('click', '#cmp-resolve-btn', function (e) {
            e.preventDefault();
            resolvePlatformTrack();
        });

        $(document).on('click', '#cmp-insert-btn', function (e) {
            e.preventDefault();
            var source = $('#cmp-source').val() || 'custom';
            var mode = $('#cmp-mode').val() || 'click';
            var notice = $('#cmp-notice').is(':checked');

            if (source === 'custom') {
                var title = $.trim($('#cmp-title').val());
                var src = $.trim($('#cmp-src').val());
                if (!title) {
                    window.alert('请填写歌曲名');
                    return;
                }
                if (!src) {
                    window.alert('请填写音频 URL，或从附件选择');
                    return;
                }
                var code = buildShortcode({
                    from: 'custom',
                    title: title,
                    artist: $.trim($('#cmp-artist').val()),
                    src: src,
                    cover: $.trim($('#cmp-cover').val()),
                    mode: mode,
                    notice: notice
                });
                if (insertIntoEditor(code)) {
                    closeModal();
                }
                return;
            }

            var id = extractPlatformId($('#cmp-platform-id').val(), source);
            if (!id) {
                window.alert('请填写网易云/QQ 音乐歌曲 ID 或分享链接');
                return;
            }

            var doInsert = function (meta) {
                var code = buildShortcode({
                    from: source,
                    id: id,
                    title: meta && meta.title ? meta.title : $.trim($('#cmp-title').val()),
                    artist: meta && meta.artist ? meta.artist : $.trim($('#cmp-artist').val()),
                    cover: meta && meta.cover ? meta.cover : $.trim($('#cmp-cover').val()),
                    mode: mode,
                    notice: notice
                });
                if (insertIntoEditor(code)) {
                    closeModal();
                }
            };

            // Prefer fresh resolve; fall back to typed fields if already parsed
            if ($.trim($('#cmp-title').val()) && $('#cmp-platform-id').val() === id) {
                doInsert({
                    title: $.trim($('#cmp-title').val()),
                    artist: $.trim($('#cmp-artist').val()),
                    cover: $.trim($('#cmp-cover').val())
                });
                return;
            }

            resolvePlatformTrack().then(function (meta) {
                doInsert(meta || {});
            });
        });

        $(document).on('keydown', function (e) {
            if (e.key === 'Escape' && !$('#cmp-inserter-modal').prop('hidden')) {
                closeModal();
            }
        });

        var fileList = document.getElementById('file-list');
        if (fileList && window.MutationObserver) {
            new MutationObserver(function () {
                if (!$('#cmp-inserter-modal').prop('hidden')) {
                    fillAttachmentSelects();
                }
            }).observe(fileList, { childList: true, subtree: true });
        }
    });
})(window.jQuery);
