(function ($) {
    'use strict';

    var bootRoot = window.CI_BOOT || {};
    var boot = (bootRoot.components && bootRoot.components.notice) || {};
    var siteUrl = boot.siteUrl || '/';
    var PRESET_STORAGE_KEY = 'an-notice-user-presets-v1';

    var BUILTIN_PRESETS = {
        custom: {
            label: '自定义（空白）',
            title: '',
            color: boot.defaultColor || '#1095c1',
            text: boot.defaultTextColor || '#ffffff',
            radius: '12',
            shadow: true,
            body: ''
        },
        welcome: {
            label: '作者欢迎',
            title: '',
            color: '#1095c1',
            text: '#ffffff',
            radius: '12',
            shadow: true,
            body: [
                '你好 👋 我是 Manueld。本站是我的个人博客，于 2024.8.22 起向私域测试性开放。',
                '',
                '本站仍处于并将长期处于「装修」状态，许多文章完成度尚不高。欢迎你来随意走走，留下你的足迹 👣',
                '',
                '寻找笔记等资料的学弟学妹，请跳转→ [分类：笔记](' + siteUrl + 'category/notes/)；如果你想了解更多有关我和本站的内容，请访问→ [关于](' + siteUrl + 'about.html)'
            ].join('\n')
        },
        cosmos: {
            label: '宇宙安全声明',
            title: '宇宙安全声明',
            color: '#8b0000',
            text: '#ffffff',
            radius: '12',
            shadow: true,
            body: '我完全拥护社会主义，拥护中国共产党的领导，拥护社会主义核心价值观；反对任何分裂国家的行为；遵守《网络信息内容生态治理规定》等法规，共同营造清朗网络空间。我反对法西斯主义、殖民主义、帝国主义、修正主义、霸权主义，反对邪教与毒品，拥护中华人民共和国宪法。文中含我的主观见解，请自行甄别；若感不适请立即关闭本页。评论区请文明讨论，严禁违法、色情、暴力及极端言论。本声明随页发出，视为已阅知。'
        },
        fiction: {
            label: '内容性质声明',
            title: '内容性质声明',
            color: '#37474f',
            text: '#ffffff',
            radius: '12',
            shadow: true,
            body: [
                '本页内容如无特别说明，均属虚构或学习笔记整理，仅供娱乐 / 交流参考，与现实事件、现实意识形态无直接对应关系。',
                '',
                '文中展示物品均经合法渠道取得；字体优先使用开源或已获授权资源，避免侵权。若出现地图等信息，均以符合国家有关规定的公开资料为准。',
                '',
                '作者非任何团体「水军」，亦不代表除本人以外的任何组织或个人立场。'
            ].join('\n')
        },
        audience: {
            label: '受众与互动提示',
            title: '阅读提示',
            color: '#455a64',
            text: '#ffffff',
            radius: '12',
            shadow: true,
            body: [
                '建议具备独立思考能力、年龄约 12 岁及以上的读者阅读；若不认同文中观点或感到不适，请立即关闭页面。',
                '',
                '欢迎在评论区礼貌讨论；严禁发布违法违规、色情低俗、暴力血腥或极端言论。作者有权视情况删除不当留言。'
            ].join('\n')
        },
        persona: {
            label: '作者趣味声明',
            title: '作者声明',
            color: '#5d4037',
            text: '#ffffff',
            radius: '12',
            shadow: true,
            body: [
                '作者为地球人，热爱地球文化，无反人类倾向；承诺不向三体人、外星文明或其他维度发送地球坐标。',
                '',
                '作者家庭和睦，智力与精神状态正常；表达能力与表情管理一般，请勿过度解读语气或神态。个人观点仅代表作者本人，不代表父母、亲友或所在地区。',
                '',
                '支持男女平等；爱护小动物，无意践踏人类尊严或动物权益。'
            ].join('\n')
        },
        revision: {
            label: '内容修订提示',
            title: '内容提示',
            color: '#546e7a',
            text: '#ffffff',
            radius: '12',
            shadow: true,
            body: [
                '本文仍在修订中，部分段落可能不完整或将调整。',
                '',
                '引用前请核对发布时间与后续更新；如发现事实性错误，欢迎通过评论或站内渠道告知。'
            ].join('\n')
        }
    };

    function escapeHtml(v) { return window.CI_escapeHtml ? window.CI_escapeHtml(v) : String(v || ''); }
    function escapeAttr(v) { return window.CI_escapeAttr ? window.CI_escapeAttr(v) : String(v || ''); }

    function loadUserPresets() {
        try {
            var raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
            if (!raw) return {};
            var data = JSON.parse(raw);
            return data && typeof data === 'object' ? data : {};
        } catch (e) {
            return {};
        }
    }

    function saveUserPresets(map) {
        try {
            window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(map || {}));
        } catch (e) {
            window.alert('无法保存预设（浏览器可能禁用了本地存储）');
        }
    }

    function isUserPresetKey(key) {
        return String(key || '').indexOf('user_') === 0;
    }

    function getPreset(key) {
        if (BUILTIN_PRESETS[key]) return BUILTIN_PRESETS[key];
        return loadUserPresets()[key] || null;
    }

    function rebuildPresetSelect(selected) {
        var $sel = $('#an-notice-preset').empty();
        Object.keys(BUILTIN_PRESETS).forEach(function (key) {
            $sel.append($('<option></option>').val(key).text(BUILTIN_PRESETS[key].label || key));
        });
        var user = loadUserPresets();
        var keys = Object.keys(user);
        if (keys.length) {
            var $group = $('<optgroup></optgroup>').attr('label', '我的预设');
            keys.sort(function (a, b) {
                return String(user[a].label || a).localeCompare(String(user[b].label || b), 'zh');
            }).forEach(function (key) {
                $group.append($('<option></option>').val(key).text(user[key].label || key));
            });
            $sel.append($group);
        }
        if (selected && $sel.find('option[value="' + selected + '"]').length) {
            $sel.val(selected);
        } else {
            $sel.val('custom');
        }
        syncPresetDeleteBtn();
    }

    function syncPresetDeleteBtn() {
        $('#an-preset-delete').prop('hidden', !isUserPresetKey($('#an-notice-preset').val()));
    }

    function collectForm() {
        return {
            title: $.trim($('#an-notice-title').val()),
            color: $.trim($('#an-notice-color-text').val()) || '#1095c1',
            text: $.trim($('#an-notice-text-text').val()) || '#ffffff',
            radius: String(parseInt($('#an-notice-radius').val(), 10) || 12),
            shadow: $('#an-notice-shadow').is(':checked'),
            body: String($('#an-notice-body').val() || '').replace(/\r\n|\r/g, '\n').trim()
        };
    }

    function applyPreset(key) {
        var p = getPreset(key) || BUILTIN_PRESETS.custom;
        var color = p.color || '#1095c1';
        var text = p.text || '#ffffff';
        $('#an-notice-title').val(p.title || '');
        $('#an-notice-color').val(/^#([0-9a-f]{6})$/i.test(color) ? color : '#1095c1');
        $('#an-notice-color-text').val(color);
        $('#an-notice-text').val(/^#([0-9a-f]{6})$/i.test(text) ? text : '#ffffff');
        $('#an-notice-text-text').val(text);
        $('#an-notice-radius').val(p.radius || '12');
        $('#an-notice-shadow').prop('checked', p.shadow !== false);
        $('#an-notice-body').val(p.body || '');
        syncPresetDeleteBtn();
        if (window.CI_refreshPreview) window.CI_refreshPreview();
    }

    function formatBodyHtml(raw) {
        raw = String(raw || '').replace(/\r\n|\r/g, '\n').trim();
        if (!raw) return '';
        if (/<(p|div|ul|ol)\b/i.test(raw)) {
            return raw.replace(/<p\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
        }
        return raw.split(/\n\s*\n/).map(function (part) {
            part = $.trim(part);
            if (!part) return '';
            var escaped = escapeHtml(part).replace(
                /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*|#[^)\s]*)\)/g,
                '<a href="$2">$1</a>'
            );
            return '<p>' + escaped.replace(/\n/g, '<br>') + '</p>';
        }).join('');
    }

    function previewHtml() {
        var form = collectForm();
        var body = formatBodyHtml(form.body);
        if (!form.title && !body) {
            return '<p class="ci-preview-empty">填写标题或内容后显示预览。</p>';
        }
        var style = '--an-bg:' + form.color + ';--an-fg:' + form.text + ';--an-radius:' + form.radius + 'px;';
        var cls = 'an-notice' + (form.shadow ? '' : ' an-notice--flat');
        var html = '<aside class="' + cls + '" style="' + escapeHtml(style) + '">';
        if (form.title) html += '<div class="an-notice-title">' + escapeHtml(form.title) + '</div>';
        if (body) html += '<div class="an-notice-body">' + body + '</div>';
        html += '</aside>';
        return html;
    }

    function buildShortcode() {
        var form = collectForm();
        if (!form.title && !form.body) {
            window.alert('请填写标题或内容');
            return '';
        }
        var open = '[notice color="' + escapeAttr(form.color) + '" text="' + escapeAttr(form.text) + '"'
            + ' radius="' + escapeAttr(form.radius) + '"'
            + ' shadow="' + (form.shadow ? '1' : '0') + '"';
        if (form.title) open += ' title="' + escapeAttr(form.title) + '"';
        open += ']';
        return open + '\n' + form.body + '\n[/notice]';
    }

    function syncColorPair(pickerId, textId) {
        var $picker = $(pickerId);
        var $text = $(textId);
        $picker.on('input change', function () {
            $text.val($picker.val());
            if (window.CI_refreshPreview) window.CI_refreshPreview();
        });
        $text.on('input change', function () {
            var v = $.trim($text.val());
            if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
                $picker.val(v.length === 4
                    ? '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
                    : v);
            }
            if (window.CI_refreshPreview) window.CI_refreshPreview();
        });
    }

    window.CI_HANDLERS = window.CI_HANDLERS || {};
    window.CI_HANDLERS.notice = {
        onShow: function () {
            rebuildPresetSelect($('#an-notice-preset').val() || 'custom');
        },
        preview: previewHtml,
        insert: function (done) {
            var code = buildShortcode();
            if (code && window.CI_insertIntoEditor(code)) {
                done();
            }
        }
    };

    $(function () {
        if (boot.defaultColor) {
            BUILTIN_PRESETS.custom.color = boot.defaultColor;
            $('#an-notice-color').val(boot.defaultColor);
            $('#an-notice-color-text').val(boot.defaultColor);
        }
        if (boot.defaultTextColor) {
            BUILTIN_PRESETS.custom.text = boot.defaultTextColor;
            $('#an-notice-text').val(boot.defaultTextColor);
            $('#an-notice-text-text').val(boot.defaultTextColor);
        }

        rebuildPresetSelect('custom');
        syncColorPair('#an-notice-color', '#an-notice-color-text');
        syncColorPair('#an-notice-text', '#an-notice-text-text');

        $(document).on('change', '#an-notice-preset', function () {
            applyPreset($(this).val());
        });
        $(document).on('click', '#an-preset-save', function (e) {
            e.preventDefault();
            var form = collectForm();
            if (!form.title && !form.body) {
                window.alert('请先填写标题或内容，再保存预设');
                return;
            }
            var name = window.prompt('预设名称', form.title || '我的预设');
            if (name === null) return;
            name = $.trim(name);
            if (!name) {
                window.alert('预设名称不能为空');
                return;
            }
            var map = loadUserPresets();
            var key = 'user_' + Date.now().toString(36);
            map[key] = {
                label: name,
                title: form.title,
                color: form.color,
                text: form.text,
                radius: form.radius,
                shadow: form.shadow,
                body: form.body
            };
            saveUserPresets(map);
            rebuildPresetSelect(key);
            window.alert('已保存预设「' + name + '」');
        });
        $(document).on('click', '#an-preset-delete', function (e) {
            e.preventDefault();
            var key = $('#an-notice-preset').val();
            if (!isUserPresetKey(key)) return;
            var p = getPreset(key);
            var label = p && p.label ? p.label : key;
            if (!window.confirm('删除自定义预设「' + label + '」？')) return;
            var map = loadUserPresets();
            delete map[key];
            saveUserPresets(map);
            rebuildPresetSelect('custom');
            applyPreset('custom');
        });
        $(document).on(
            'input change',
            '#an-notice-title,#an-notice-body,#an-notice-radius,#an-notice-shadow',
            function () {
                if (window.CI_refreshPreview) window.CI_refreshPreview();
            }
        );
    });
})(window.jQuery);
