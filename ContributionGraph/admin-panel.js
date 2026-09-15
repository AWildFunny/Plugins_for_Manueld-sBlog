(function ($) {
    'use strict';

    var bootRoot = window.CI_BOOT || {};
    var boot = (bootRoot.components && bootRoot.components.contribution) || {};
    var defaultYear = String(boot.defaultYear || new Date().getFullYear());
    var defaultLayout = boot.defaultLayout === 'centered' ? 'centered' : 'year';

    function escapeHtml(v) { return window.CI_escapeHtml ? window.CI_escapeHtml(v) : String(v || ''); }

    function currentLayout() {
        var v = $('input[name="cg-layout"]:checked').val();
        return v === 'centered' ? 'centered' : 'year';
    }

    function syncYearVisibility() {
        var centered = currentLayout() === 'centered';
        $('#cg-year-wrap').prop('hidden', centered);
    }

    function buildShortcode() {
        var layout = currentLayout();
        if (layout === 'centered') {
            return '[ContributionGraph layout="centered"]';
        }
        var year = $.trim($('#cg-year').val());
        var parts = ['layout="year"'];
        if (year && year !== defaultYear) {
            if (!/^\d{4}$/.test(year)) {
                window.alert('请填写四位年份，或留空使用默认');
                return '';
            }
            parts.push('year="' + year + '"');
        }
        // 默认即为 year 时，可简化为 [ContributionGraph]；有 year 或显式 layout 时写全
        if (parts.length === 1 && defaultLayout === 'year') {
            return '[ContributionGraph]';
        }
        return '[ContributionGraph ' + parts.join(' ') + ']';
    }

    function previewHtml() {
        var layout = currentLayout();
        if (layout === 'centered') {
            return '<p style="margin:0;font-size:13px;color:#555">将插入约 53 周热力图，'
                + '<strong>今天所在周居中</strong>，今天方格带主题色描边。</p>';
        }
        var year = $.trim($('#cg-year').val()) || defaultYear;
        return '<p style="margin:0;font-size:13px;color:#555">将插入 <strong>'
            + escapeHtml(year) + '</strong> 年全年顺序（1–12 月）贡献热力图。</p>';
    }

    window.CI_HANDLERS = window.CI_HANDLERS || {};
    window.CI_HANDLERS.contribution = {
        onShow: function () {
            if (!$('input[name="cg-layout"]:checked').length) {
                $('#cg-layout-' + defaultLayout).prop('checked', true);
            }
            if (!$('#cg-year').val()) {
                $('#cg-year').val(defaultYear);
            }
            syncYearVisibility();
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
        $(document).on('input change', '#cg-year, input[name="cg-layout"]', function () {
            syncYearVisibility();
            if (window.CI_refreshPreview) window.CI_refreshPreview();
        });
    });
})(window.jQuery);
