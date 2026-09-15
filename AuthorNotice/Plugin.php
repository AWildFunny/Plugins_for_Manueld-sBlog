<?php
/**
 * 作者申明：文章内悬浮色块短代码与组件面板注册
 *
 * @package AuthorNotice
 * @author Manueld
 * @version 1.0.0
 * @link https://github.com/AWildFunny/Plugins_for_Manueld-sBlog
 * @dependence 9.9.2-*
 */

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

class AuthorNotice_Plugin implements Typecho_Plugin_Interface
{
    /** @var bool */
    private static $needsAssets = false;

    public static function activate()
    {
        Typecho_Plugin::factory('Widget_Abstract_Contents')->contentEx = array('AuthorNotice_Plugin', 'parse');
        Typecho_Plugin::factory('Widget_Archive')->header = array('AuthorNotice_Plugin', 'header');
        Typecho_Plugin::factory('ComponentInserter')->collect = array('AuthorNotice_Plugin', 'registerComponent');

        return _t('作者申明已启用。Daydream 主题写文章侧栏「组件插入」中可用。短代码：[notice]…[/notice]');
    }

    public static function deactivate() {}

    public static function config(Typecho_Widget_Helper_Form $form)
    {
        $defaultColor = new Typecho_Widget_Helper_Form_Element_Text(
            'defaultColor',
            null,
            '#1095c1',
            '默认背景色',
            '未指定 color 时使用。'
        );
        $form->addInput($defaultColor);

        $defaultText = new Typecho_Widget_Helper_Form_Element_Text(
            'defaultTextColor',
            null,
            '#ffffff',
            '默认文字色',
            '未指定 text 时使用。'
        );
        $form->addInput($defaultText);
    }

    public static function personalConfig(Typecho_Widget_Helper_Form $form) {}

    /**
     * 加载主题内置组件插入注册表
     * @return bool
     */
    private static function loadCiRegistry()
    {
        if (class_exists('ComponentInserter_Registry')) {
            return true;
        }
        try {
            $options = Helper::options();
            $reg = $options->themeFile($options->theme, 'include/ComponentInserter/Registry.php');
            if (is_file($reg)) {
                require_once $reg;
            }
        } catch (Exception $e) {
        }
        return class_exists('ComponentInserter_Registry');
    }

    public static function registerComponent()
    {
        if (!self::loadCiRegistry()) {
            return;
        }

        $defaults = self::getColorDefaults();
        $pluginUrl = Helper::options()->pluginUrl . '/AuthorNotice/assets';
        $siteUrl = rtrim(Helper::options()->siteUrl, '/') . '/';

        $panelHtml = <<<'HTML'
<p>
  <label for="an-notice-preset">预设</label>
  <select id="an-notice-preset" class="w-100"></select>
</p>
<p class="ci-preset-actions">
  <button type="button" class="btn btn-xs" id="an-preset-save">保存为预设</button>
  <button type="button" class="btn btn-xs" id="an-preset-delete" hidden>删除该预设</button>
</p>
<p>
  <label for="an-notice-title">标题（可选）</label>
  <input type="text" id="an-notice-title" class="text w-100" placeholder="留空则不显示标题行">
</p>
<p class="ci-inline-fields">
  <span>
    <label for="an-notice-color">背景色</label>
    <input type="color" id="an-notice-color" value="#1095c1">
    <input type="text" id="an-notice-color-text" class="text mono ci-color-text" value="#1095c1">
  </span>
  <span>
    <label for="an-notice-text">文字色</label>
    <input type="color" id="an-notice-text" value="#ffffff">
    <input type="text" id="an-notice-text-text" class="text mono ci-color-text" value="#ffffff">
  </span>
</p>
<p class="ci-inline-fields">
  <span>
    <label for="an-notice-radius">圆角（px）</label>
    <input type="number" id="an-notice-radius" class="text" min="0" max="32" value="12">
  </span>
  <span class="ci-check ci-check-inline">
    <label><input type="checkbox" id="an-notice-shadow" checked> 悬浮阴影</label>
  </span>
</p>
<p>
  <label for="an-notice-body">内容</label>
  <textarea id="an-notice-body" class="w-100 mono" rows="12" placeholder="支持空行分段；链接可用 [文字](/path)"></textarea>
</p>
HTML;

        ComponentInserter_Registry::register(array(
            'id' => 'notice',
            'label' => '作者申明',
            'order' => 20,
            'panelHtml' => $panelHtml,
            'boot' => array(
                'defaultColor' => $defaults['color'],
                'defaultTextColor' => $defaults['text'],
                'siteUrl' => $siteUrl,
            ),
            'css' => array($pluginUrl . '/notice.css?ver=1.0.0'),
            'js' => array($pluginUrl . '/admin-panel.js?ver=1.0.0'),
        ));
    }

    public static function parse($content, $widget, $lastResult)
    {
        $content = empty($lastResult) ? $content : $lastResult;

        if (!($widget instanceof Widget_Archive) || !$widget->is('single')) {
            return $content;
        }

        if (stripos($content, '[notice') === false) {
            return $content;
        }

        self::$needsAssets = true;
        $content = preg_replace('/<p>\s*(\[notice\b[^\]]*\])/i', '$1', $content);
        $content = preg_replace('/(\[\/notice\])\s*<\/p>/i', '$1', $content);
        $content = preg_replace_callback(
            '/\[notice\b([^\]]*)\](.*?)\[\/notice\]/is',
            array('AuthorNotice_Plugin', 'renderNotice'),
            $content
        );

        return $content;
    }

    public static function renderNotice($matches)
    {
        $attrs = self::parseAttributes(isset($matches[1]) ? $matches[1] : '');
        $bodyRaw = isset($matches[2]) ? trim($matches[2]) : '';

        $title = isset($attrs['title']) ? trim($attrs['title']) : '';
        $color = isset($attrs['color']) ? trim($attrs['color']) : '';
        $text = isset($attrs['text']) ? trim($attrs['text']) : '';
        if ($text === '' && isset($attrs['textcolor'])) {
            $text = trim($attrs['textcolor']);
        }

        $shadow = self::attrBool(isset($attrs['shadow']) ? $attrs['shadow'] : '1', true);
        $radius = isset($attrs['radius']) ? trim($attrs['radius']) : '12';
        if (!preg_match('/^\d{1,2}$/', $radius)) {
            $radius = '12';
        }

        $defaults = self::getColorDefaults();
        if ($color === '' || !self::isCssColor($color)) {
            $color = $defaults['color'];
        }
        if ($text === '' || !self::isCssColor($text)) {
            $text = $defaults['text'];
        }

        $bodyHtml = self::formatNoticeBody($bodyRaw);
        if ($bodyHtml === '' && $title === '') {
            return '';
        }

        $style = '--an-bg:' . $color . ';--an-fg:' . $text . ';--an-radius:' . $radius . 'px;';
        $classes = 'an-notice';
        if (!$shadow) {
            $classes .= ' an-notice--flat';
        }

        $html = '<aside class="' . $classes . '" style="' . htmlspecialchars($style, ENT_QUOTES, 'UTF-8') . '" role="note">';
        if ($title !== '') {
            $html .= '<div class="an-notice-title">' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</div>';
        }
        if ($bodyHtml !== '') {
            $html .= '<div class="an-notice-body">' . $bodyHtml . '</div>';
        }
        $html .= '</aside>';

        return $html;
    }

    private static function getColorDefaults()
    {
        $color = '#1095c1';
        $text = '#ffffff';
        try {
            $plugin = Helper::options()->plugin('AuthorNotice');
            if (!empty($plugin->defaultColor) && self::isCssColor($plugin->defaultColor)) {
                $color = trim($plugin->defaultColor);
            }
            if (!empty($plugin->defaultTextColor) && self::isCssColor($plugin->defaultTextColor)) {
                $text = trim($plugin->defaultTextColor);
            }
        } catch (Exception $e) {
            try {
                $legacy = Helper::options()->plugin('ArticleComponents');
                if (!empty($legacy->defaultColor) && self::isCssColor($legacy->defaultColor)) {
                    $color = trim($legacy->defaultColor);
                }
                if (!empty($legacy->defaultTextColor) && self::isCssColor($legacy->defaultTextColor)) {
                    $text = trim($legacy->defaultTextColor);
                }
            } catch (Exception $e2) {
            }
        }
        return array('color' => $color, 'text' => $text);
    }

    private static function attrBool($value, $default)
    {
        $v = strtolower(trim((string) $value));
        if ($v === '') {
            return $default;
        }
        if (in_array($v, array('0', 'false', 'no', 'off'), true)) {
            return false;
        }
        if (in_array($v, array('1', 'true', 'yes', 'on'), true)) {
            return true;
        }
        return $default;
    }

    private static function isCssColor($color)
    {
        $color = trim($color);
        if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $color)) {
            return true;
        }
        if (preg_match('/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i', $color)) {
            return true;
        }
        return false;
    }

    private static function formatNoticeBody($raw)
    {
        $raw = trim(str_replace(array("\r\n", "\r"), "\n", $raw));
        if ($raw === '') {
            return '';
        }

        if (preg_match('/<(p|div|ul|ol|br)\b/i', $raw)) {
            return self::normalizeNoticeHtml(self::sanitizeNoticeHtml($raw));
        }

        $parts = preg_split('/\n\s*\n/', $raw);
        $html = '';
        foreach ($parts as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }
            $escaped = htmlspecialchars($part, ENT_QUOTES, 'UTF-8');
            $escaped = preg_replace(
                '/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*|#[^)\s]*)\)/',
                '<a href="$2">$1</a>',
                $escaped
            );
            $html .= '<p>' . nl2br($escaped, false) . '</p>';
        }

        return self::normalizeNoticeHtml($html);
    }

    private static function stripEmptyNoticeBlocks($html)
    {
        $html = preg_replace('/<p\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/i', '', $html);
        return trim($html);
    }

    private static function normalizeNoticeHtml($html)
    {
        $html = trim($html);
        $html = preg_replace('/^(?:<br\s*\/?>|\s|&nbsp;)+/i', '', $html);
        $html = preg_replace('/(?:<br\s*\/?>|\s|&nbsp;)+$/i', '', $html);
        $html = self::stripEmptyNoticeBlocks($html);

        if ($html === '') {
            return '';
        }

        if (!preg_match('/^<(p|ul|ol|div)\b/i', $html)) {
            if (preg_match('/^(.*?)(?=<(?:p|ul|ol|div)\b)/is', $html, $m)) {
                $lead = trim(preg_replace('/^(?:<br\s*\/?>|\s|&nbsp;)+|(?:<br\s*\/?>|\s|&nbsp;)+$/i', '', $m[1]));
                $rest = substr($html, strlen($m[1]));
                $html = ($lead !== '' ? '<p>' . $lead . '</p>' : '') . $rest;
            } else {
                $html = '<p>' . preg_replace('/^(?:<br\s*\/?>|\s|&nbsp;)+|(?:<br\s*\/?>|\s|&nbsp;)+$/i', '', $html) . '</p>';
            }
        }

        return self::stripEmptyNoticeBlocks($html);
    }

    private static function sanitizeNoticeHtml($html)
    {
        $allowed = '<p><br><a><strong><b><em><i><ul><ol><li><span>';
        $html = strip_tags($html, $allowed);
        $html = preg_replace_callback(
            '/<a\s+([^>]*)>/i',
            function ($m) {
                $attrs = $m[1];
                $href = '';
                if (preg_match('/href\s*=\s*"([^"]*)"/i', $attrs, $hm) || preg_match("/href\s*=\s*'([^']*)'/i", $attrs, $hm)) {
                    $href = trim($hm[1]);
                }
                if ($href === '' || (!preg_match('#^https?://#i', $href) && strpos($href, '/') !== 0 && strpos($href, '#') !== 0)) {
                    return '<a>';
                }
                return '<a href="' . htmlspecialchars($href, ENT_QUOTES, 'UTF-8') . '">';
            },
            $html
        );
        return $html;
    }

    private static function parseAttributes($attrString)
    {
        $attrs = array();
        if (preg_match_all('/(\w+)\s*=\s*"([^"]*)"/', $attrString, $m, PREG_SET_ORDER)) {
            foreach ($m as $item) {
                $attrs[strtolower($item[1])] = $item[2];
            }
        }
        if (preg_match_all("/(\w+)\s*=\s*'([^']*)'/", $attrString, $m, PREG_SET_ORDER)) {
            foreach ($m as $item) {
                $key = strtolower($item[1]);
                if (!isset($attrs[$key])) {
                    $attrs[$key] = $item[2];
                }
            }
        }
        return $attrs;
    }

    private static function shouldLoadAssets()
    {
        if (self::$needsAssets) {
            return true;
        }
        try {
            $widget = Typecho_Widget::widget('Widget_Archive');
            if ($widget->is('single') && isset($widget->text)) {
                $raw = (string) $widget->text;
                if ($raw !== '' && stripos($raw, '[notice') !== false) {
                    self::$needsAssets = true;
                    return true;
                }
            }
        } catch (Exception $e) {
        }
        return false;
    }

    public static function header()
    {
        if (!self::shouldLoadAssets()) {
            return;
        }
        $base = Helper::options()->pluginUrl . '/AuthorNotice/assets/notice.css';
        echo '<link rel="stylesheet" href="' . htmlspecialchars($base . '?ver=1.0.0', ENT_QUOTES, 'UTF-8') . '">';
    }
}
