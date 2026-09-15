<?php
/**
 * 文章内嵌唱片式音乐播放器，支持环形进度、悬浮迷你条、进页提示、自定义/网易云插入
 *
 * @package CustomMusicPlayer
 * @author Manueld
 * @version 2.3.2
 * @link https://github.com/AWildFunny/Plugins_for_Manueld-sBlog
 * @dependence 9.9.2-*
 */

if (!defined('__TYPECHO_ROOT_DIR__')) exit;

class CustomMusicPlayer_Plugin implements Typecho_Plugin_Interface
{
    /** @var bool */
    private static $needsAssets = false;

    public static function activate()
    {
        Typecho_Plugin::factory('Widget_Abstract_Contents')->contentEx = array('CustomMusicPlayer_Plugin', 'parse');
        Typecho_Plugin::factory('Widget_Archive')->header = array('CustomMusicPlayer_Plugin', 'header');
        Typecho_Plugin::factory('Widget_Archive')->footer = array('CustomMusicPlayer_Plugin', 'footer');

        Typecho_Plugin::factory('admin/write-post.php')->option = array('CustomMusicPlayer_Plugin', 'adminOption');
        Typecho_Plugin::factory('admin/write-post.php')->bottom = array('CustomMusicPlayer_Plugin', 'adminBottom');
        Typecho_Plugin::factory('admin/write-page.php')->option = array('CustomMusicPlayer_Plugin', 'adminOption');
        Typecho_Plugin::factory('admin/write-page.php')->bottom = array('CustomMusicPlayer_Plugin', 'adminBottom');

        Typecho_Plugin::factory('ComponentInserter')->collect = array('CustomMusicPlayer_Plugin', 'registerComponent');
    }

    public static function deactivate() {}

    public static function config(Typecho_Widget_Helper_Form $form)
    {
        $api = new Typecho_Widget_Helper_Form_Element_Text(
            'metingApi',
            null,
            'https://meting.mikus.ink/api?server=:server&type=:type&id=:id',
            'Meting API 地址',
            '用于拼接播放地址，并供浏览器补拉歌名/封面。占位符：<code>:server</code> <code>:type</code> <code>:id</code>。第三方接口可能失效，可自行部署后替换。'
        );
        $form->addInput($api);

        $hint = new Typecho_Widget_Helper_Form_Element_Text(
            'playerHint',
            null,
            '点按唱片播放 · 拖动外环调节进度',
            '播放器备注文案',
            '显示在曲名/艺术家下方的灰色提示。留空则不显示。单条短代码可用 <code>hint="..."</code> 覆盖。'
        );
        $form->addInput($hint);
    }

    public static function personalConfig(Typecho_Widget_Helper_Form $form) {}

    /**
     * @param string $content
     * @param Widget_Abstract_Contents $widget
     * @param string $lastResult
     * @return string
     */
    public static function parse($content, $widget, $lastResult)
    {
        $content = empty($lastResult) ? $content : $lastResult;

        if (!($widget instanceof Widget_Archive) || !$widget->is('single')) {
            return $content;
        }

        if (strpos($content, '[music') === false && stripos($content, '[CustomMusicPlayer') === false) {
            return $content;
        }

        self::$needsAssets = true;

        $content = preg_replace_callback(
            '/\[(music|CustomMusicPlayer)\s+([^\]]+)\]/i',
            array('CustomMusicPlayer_Plugin', 'renderShortcode'),
            $content
        );

        return $content;
    }

    /**
     * @param array<int, string> $matches
     * @return string
     */
    public static function renderShortcode($matches)
    {
        $attrs = self::parseAttributes($matches[2]);

        $from = isset($attrs['from']) ? strtolower(trim($attrs['from'])) : 'custom';
        if (isset($attrs['server']) && $from === 'custom') {
            $from = strtolower(trim($attrs['server']));
        }

        $title = isset($attrs['title']) ? trim($attrs['title']) : '';
        $artist = isset($attrs['artist']) ? trim($attrs['artist']) : '';
        $src = '';
        if (isset($attrs['src'])) {
            $src = trim($attrs['src']);
        } elseif (isset($attrs['audio'])) {
            $src = trim($attrs['audio']);
        }
        $cover = isset($attrs['cover']) ? trim($attrs['cover']) : '';
        $mode = isset($attrs['mode']) ? strtolower(trim($attrs['mode'])) : 'click';
        $notice = isset($attrs['notice']) ? strtolower(trim($attrs['notice'])) : '0';
        $platformId = isset($attrs['id']) ? trim($attrs['id']) : '';
        $hintOverride = array_key_exists('hint', $attrs) ? trim($attrs['hint']) : null;

        if (!in_array($mode, array('click', 'scroll'), true)) {
            $mode = 'click';
        }

        $noticeOn = in_array($notice, array('1', 'true', 'yes', 'on'), true);

        if (in_array($from, array('netease', 'tencent'), true)) {
            $platformId = self::normalizePlatformId($from, $platformId);
            if ($platformId === '') {
                return '<p class="music-player-error" role="alert">音乐播放器缺少平台歌曲 ID。</p>';
            }
            if ($src === '') {
                $src = self::buildMetingUrl($from, 'url', $platformId);
            }
        }

        if ($title === '') {
            $title = '未命名曲目';
        }

        if ($src === '') {
            return '<p class="music-player-error" role="alert">音乐播放器缺少音频地址（src）。</p>';
        }

        $id = 'mp-' . substr(md5($src . $title . $from . $platformId . uniqid('', true)), 0, 10);

        $titleEsc = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        $artistEsc = htmlspecialchars($artist, ENT_QUOTES, 'UTF-8');
        $srcEsc = htmlspecialchars($src, ENT_QUOTES, 'UTF-8');
        $coverEsc = htmlspecialchars($cover, ENT_QUOTES, 'UTF-8');
        $modeEsc = htmlspecialchars($mode, ENT_QUOTES, 'UTF-8');
        $noticeEsc = $noticeOn ? '1' : '0';
        $platformAttrs = '';
        if (in_array($from, array('netease', 'tencent'), true) && $platformId !== '') {
            $platformAttrs = ' data-mp-server="' . htmlspecialchars($from, ENT_QUOTES, 'UTF-8') . '"'
                . ' data-mp-song="' . htmlspecialchars($platformId, ENT_QUOTES, 'UTF-8') . '"'
                . ' data-mp-api="' . htmlspecialchars(self::metingApiTpl(), ENT_QUOTES, 'UTF-8') . '"';
        }

        $coverHtml = $cover !== ''
            ? '<img class="music-player-cover" src="' . $coverEsc . '" alt="' . $titleEsc . '" loading="lazy">'
            : '<div class="music-player-cover music-player-cover--placeholder" aria-hidden="true"></div>';

        $artistHtml = $artist !== ''
            ? '<p class="music-player-artist">' . $artistEsc . '</p>'
            : '';

        $hintText = self::resolvePlayerHint($hintOverride);
        $hintHtml = $hintText !== ''
            ? '<p class="music-player-hint">' . htmlspecialchars($hintText, ENT_QUOTES, 'UTF-8') . '</p>'
            : '';

        $ringSvg = self::ringSvg('music-player-ring');

        return '
<figure class="music-player" id="' . $id . '" data-mp-id="' . $id . '" data-src="' . $srcEsc . '" data-mode="' . $modeEsc . '" data-title="' . $titleEsc . '" data-cover="' . $coverEsc . '" data-notice="' . $noticeEsc . '"' . $platformAttrs . '>
    <div class="music-player-body">
        <div class="music-player-vinyl-wrap">
            <button type="button" class="music-player-disc-btn" aria-label="播放 ' . $titleEsc . '">
                ' . $ringSvg . '
                <div class="music-player-disc" aria-hidden="true">
                    ' . $coverHtml . '
                    <span class="music-player-disc-hole"></span>
                </div>
                <span class="music-player-center-ctrl" aria-hidden="true">
                    <svg class="music-player-icon music-player-icon--play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <svg class="music-player-icon music-player-icon--pause" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </span>
            </button>
        </div>
        <figcaption class="music-player-meta">
            <p class="music-player-title">' . $titleEsc . '</p>
            ' . $artistHtml . '
            ' . $hintHtml . '
        </figcaption>
    </div>
    <div class="music-player-sentinel" aria-hidden="true"></div>
</figure>';
    }

    /**
     * @param string|null $override 短代码 hint；null 表示未传，用插件默认
     * @return string
     */
    private static function resolvePlayerHint($override)
    {
        if ($override !== null) {
            return $override;
        }

        $default = '点按唱片播放 · 拖动外环调节进度';
        try {
            $plugin = Helper::options()->plugin('CustomMusicPlayer');
            if (isset($plugin->playerHint)) {
                return trim((string) $plugin->playerHint);
            }
        } catch (Exception $e) {
        }

        return $default;
    }

    /**
     * @return string
     */
    private static function metingApiTpl()
    {
        $apiTpl = 'https://meting.mikus.ink/api?server=:server&type=:type&id=:id';
        try {
            $plugin = Helper::options()->plugin('CustomMusicPlayer');
            if (!empty($plugin->metingApi)) {
                $apiTpl = trim($plugin->metingApi);
            }
        } catch (Exception $e) {
        }

        return $apiTpl;
    }

    /**
     * @param string $server netease|tencent
     * @param string $id
     * @return string
     */
    private static function normalizePlatformId($server, $id)
    {
        $id = trim((string) $id);
        if ($server === 'tencent') {
            return preg_replace('/[^a-zA-Z0-9]/', '', $id);
        }
        return preg_replace('/\D+/', '', $id);
    }

    /**
     * @param string $server
     * @param string $type song|url|pic|lrc
     * @param string $id
     * @return string
     */
    private static function buildMetingUrl($server, $type, $id)
    {
        return str_replace(
            array(':server', ':type', ':id'),
            array(rawurlencode($server), rawurlencode($type), rawurlencode($id)),
            self::metingApiTpl()
        );
    }

    /**
     * @param string $server netease|tencent
     * @param string $id
     * @return array{title:string,artist:string,src:string,cover:string}|null
     */
    private static function resolvePlatformTrack($server, $id)
    {
        $id = self::normalizePlatformId($server, $id);
        if ($id === '') {
            return null;
        }

        $json = self::httpGet(self::buildMetingUrl($server, 'song', $id));
        if ($json === null || $json === '') {
            return null;
        }

        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }

        // Meting may return object or array of objects
        if (isset($data[0]) && is_array($data[0])) {
            $data = $data[0];
        }

        $title = '';
        if (isset($data['title'])) {
            $title = (string) $data['title'];
        } elseif (isset($data['name'])) {
            $title = (string) $data['name'];
        }

        $artist = '';
        if (isset($data['author'])) {
            $artist = is_array($data['author']) ? implode(' / ', $data['author']) : (string) $data['author'];
        } elseif (isset($data['artist'])) {
            $artist = is_array($data['artist']) ? implode(' / ', $data['artist']) : (string) $data['artist'];
        }

        $src = isset($data['url']) ? (string) $data['url'] : '';
        $cover = '';
        if (isset($data['pic'])) {
            $cover = (string) $data['pic'];
        } elseif (isset($data['cover'])) {
            $cover = (string) $data['cover'];
        }

        if ($src === '') {
            return null;
        }

        return array(
            'title' => $title !== '' ? $title : '未命名曲目',
            'artist' => $artist,
            'src' => $src,
            'cover' => $cover
        );
    }

    /**
     * @param string $url
     * @return string|null
     */
    private static function httpGet($url)
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, array(
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_USERAGENT => 'CustomMusicPlayer/2.2 Typecho'
            ));
            $body = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($body === false || $code >= 400) {
                return null;
            }
            return $body;
        }

        $ctx = stream_context_create(array(
            'http' => array(
                'timeout' => 10,
                'header' => "User-Agent: CustomMusicPlayer/2.2 Typecho\r\n"
            )
        ));
        $body = @file_get_contents($url, false, $ctx);
        return $body === false ? null : $body;
    }

    /**
     * @param string $className
     * @return string
     */
    private static function ringSvg($className)
    {
        return '<svg class="' . $className . '" viewBox="0 0 100 100" aria-hidden="true">'
            . '<circle class="' . $className . '-track" cx="50" cy="50" r="46" fill="none"></circle>'
            . '<circle class="' . $className . '-progress" cx="50" cy="50" r="46" fill="none"></circle>'
            . '</svg>';
    }

    /**
     * @param string $text
     * @return array<string, string>
     */
    private static function parseAttributes($text)
    {
        $attrs = array();
        if (preg_match_all('/(\w+)\s*=\s*(["\'])(.*?)\2/is', $text, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $attrs[strtolower($match[1])] = $match[3];
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
            $archive = Typecho_Widget::widget('Widget_Archive');
            if (!$archive->is('single')) {
                return false;
            }
            // header 早于 contentEx：用正文原文判断是否含短代码，避免全站单页强挂资源
            $raw = isset($archive->text) ? (string) $archive->text : '';
            if ($raw !== '' && (strpos($raw, '[music') !== false || stripos($raw, '[CustomMusicPlayer') !== false)) {
                self::$needsAssets = true;
                return true;
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

        $base = Helper::options()->pluginUrl . '/CustomMusicPlayer/assets/music-player.css';
        echo '<link rel="stylesheet" href="' . htmlspecialchars($base . '?ver=2.3.0', ENT_QUOTES, 'UTF-8') . '">';
    }

    public static function footer()
    {
        if (!self::shouldLoadAssets()) {
            return;
        }

        $base = Helper::options()->pluginUrl . '/CustomMusicPlayer/assets/music-player.js';
        echo '<script src="' . htmlspecialchars($base . '?ver=2.3.2', ENT_QUOTES, 'UTF-8') . '" defer></script>';
    }

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

    /**
     * 向组件插入壳注册音乐组件
     */
    public static function registerComponent()
    {
        if (!self::loadCiRegistry()) {
            return;
        }

        $apiTpl = self::metingApiTpl();
        $playerHint = '点按唱片播放 · 拖动外环调节进度';
        try {
            $plugin = Helper::options()->plugin('CustomMusicPlayer');
            if (isset($plugin->playerHint)) {
                $playerHint = trim((string) $plugin->playerHint);
            }
        } catch (Exception $e) {
        }

        $pluginUrl = Helper::options()->pluginUrl . '/CustomMusicPlayer/assets';

        $panelHtml = <<<'HTML'
<p>
  <label for="cmp-source">插入方式</label>
  <select id="cmp-source" class="w-100">
    <option value="custom">自定义（URL / 附件）</option>
    <option value="netease">网易云音乐（歌曲 ID）</option>
    <option value="tencent">QQ 音乐（歌曲 ID）</option>
  </select>
</p>
<div id="cmp-panel-platform" class="cmp-panel" hidden>
  <p>
    <label for="cmp-platform-id">歌曲 ID 或分享链接 <span class="ci-req">*</span></label>
    <input type="text" id="cmp-platform-id" class="text w-100 mono" placeholder="如 185809 或分享链接">
  </p>
  <p>
    <button type="button" class="btn btn-xs" id="cmp-resolve-btn">解析曲目信息</button>
    <span id="cmp-resolve-status" class="description" style="margin-left:8px"></span>
  </p>
</div>
<p>
  <label for="cmp-title">歌曲名 <span class="ci-req cmp-req-title">*</span></label>
  <input type="text" id="cmp-title" class="text w-100" placeholder="歌曲名">
</p>
<p>
  <label for="cmp-artist">艺术家</label>
  <input type="text" id="cmp-artist" class="text w-100" placeholder="可选">
</p>
<div id="cmp-panel-custom" class="cmp-panel">
  <p>
    <label for="cmp-src">音频 URL（MP3） <span class="ci-req">*</span></label>
    <input type="text" id="cmp-src" class="text w-100 mono" placeholder="https://... 或从附件选择">
    <select id="cmp-src-pick" class="w-100"><option value="">— 从已上传附件选择音频 —</option></select>
  </p>
  <p>
    <label for="cmp-cover">封面 URL</label>
    <input type="text" id="cmp-cover" class="text w-100 mono" placeholder="可选">
    <select id="cmp-cover-pick" class="w-100"><option value="">— 从已上传附件选择封面 —</option></select>
  </p>
</div>
<p>
  <label for="cmp-mode">播放模式</label>
  <select id="cmp-mode" class="w-100">
    <option value="click">点击播放</option>
    <option value="scroll">滚入视口自动播放</option>
  </select>
</p>
<p>
  <label for="cmp-hint">备注文案</label>
  <input type="text" id="cmp-hint" class="text w-100" placeholder="">
  <span class="description">显示在曲名下方的灰色提示。留空则不写入短代码，前台自动使用插件默认备注文案。</span>
</p>
<p class="ci-check">
  <label><input type="checkbox" id="cmp-notice" value="1" checked> 进页显示「含背景音频」提示窗</label>
</p>
HTML;

        ComponentInserter_Registry::register(array(
            'id' => 'music',
            'label' => '音乐播放器',
            'order' => 10,
            'panelHtml' => $panelHtml,
            'boot' => array(
                'metingApi' => $apiTpl,
                'defaultHint' => $playerHint,
            ),
            'js' => array($pluginUrl . '/admin-panel.js?ver=2.3.0'),
        ));
    }

    /**
     * Daydream 主题内置「组件插入」时，隐藏本插件独立侧栏入口。
     * @return bool
     */
    private static function adminHandledByComponents()
    {
        if (class_exists('Daydream_ComponentInserter')) {
            return true;
        }
        try {
            $options = Helper::options();
            $shell = $options->themeFile($options->theme, 'include/ComponentInserter/Shell.php');
            if (is_file($shell)) {
                return true;
            }
        } catch (Exception $e) {
        }
        return Typecho_Plugin::exists('ComponentInserter')
            || Typecho_Plugin::exists('ArticleComponents');
    }

    public static function adminOption()
    {
        if (self::adminHandledByComponents()) {
            return;
        }

        echo '<section class="typecho-post-option custom-music-player-admin-option">'
            . '<label class="typecho-label">音乐播放器</label>'
            . '<p><button type="button" class="btn btn-xs" id="cmp-open-inserter">插入音乐播放器</button></p>'
            . '<p class="description">支持自定义 URL / 附件，或网易云歌曲 ID。Daydream 主题下请用侧栏「组件插入」。</p>'
            . '</section>';
    }

    public static function adminBottom()
    {
        if (self::adminHandledByComponents()) {
            return;
        }

        $pluginUrl = Helper::options()->pluginUrl . '/CustomMusicPlayer/assets';
        $css = htmlspecialchars($pluginUrl . '/admin-inserter.css?ver=2.3.0', ENT_QUOTES, 'UTF-8');
        $js = htmlspecialchars($pluginUrl . '/admin-inserter.js?ver=2.3.0', ENT_QUOTES, 'UTF-8');
        $apiTpl = self::metingApiTpl();
        echo '<link rel="stylesheet" href="' . $css . '">';
        echo '<script>window.CMP_METING_API=' . json_encode($apiTpl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ';</script>';
        echo <<<'HTML'
<div id="cmp-inserter-modal" class="cmp-modal" hidden>
  <div class="cmp-modal-backdrop" data-cmp-close></div>
  <div class="cmp-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="cmp-modal-title">
    <div class="cmp-modal-header">
      <h3 id="cmp-modal-title">插入音乐播放器</h3>
      <button type="button" class="cmp-modal-close" data-cmp-close aria-label="关闭">&times;</button>
    </div>
    <div class="cmp-modal-body">
      <p>
        <label for="cmp-source">插入方式</label>
        <select id="cmp-source" class="w-100">
          <option value="custom">自定义（URL / 附件）</option>
          <option value="netease">网易云音乐（歌曲 ID）</option>
          <option value="tencent">QQ 音乐（歌曲 ID）</option>
        </select>
      </p>

      <div id="cmp-panel-platform" class="cmp-panel" hidden>
        <p>
          <label for="cmp-platform-id">歌曲 ID 或分享链接 <span class="cmp-req">*</span></label>
          <input type="text" id="cmp-platform-id" class="text w-100 mono" placeholder="如 185809 或 https://music.163.com/#/song?id=185809">
        </p>
        <p>
          <button type="button" class="btn btn-xs" id="cmp-resolve-btn">解析曲目信息</button>
          <span id="cmp-resolve-status" class="description" style="margin-left:8px"></span>
        </p>
      </div>

      <p>
        <label for="cmp-title">歌曲名 <span class="cmp-req cmp-req-title">*</span></label>
        <input type="text" id="cmp-title" class="text w-100" placeholder="歌曲名">
      </p>
      <p>
        <label for="cmp-artist">艺术家</label>
        <input type="text" id="cmp-artist" class="text w-100" placeholder="可选">
      </p>

      <div id="cmp-panel-custom" class="cmp-panel">
        <p>
          <label for="cmp-src">音频 URL（MP3） <span class="cmp-req">*</span></label>
          <input type="text" id="cmp-src" class="text w-100 mono" placeholder="https://... 或从附件选择">
          <select id="cmp-src-pick" class="w-100"><option value="">— 从已上传附件选择音频 —</option></select>
        </p>
        <p>
          <label for="cmp-cover">封面 URL</label>
          <input type="text" id="cmp-cover" class="text w-100 mono" placeholder="可选，图片 URL">
          <select id="cmp-cover-pick" class="w-100"><option value="">— 从已上传附件选择封面 —</option></select>
        </p>
      </div>

      <p>
        <label for="cmp-mode">播放模式</label>
        <select id="cmp-mode" class="w-100">
          <option value="click">点击播放</option>
          <option value="scroll">滚入视口自动播放</option>
        </select>
      </p>
      <p class="cmp-check">
        <label><input type="checkbox" id="cmp-notice" value="1" checked> 进页显示「含背景音频」提示窗</label>
      </p>
    </div>
    <div class="cmp-modal-footer">
      <button type="button" class="btn" data-cmp-close>取消</button>
      <button type="button" class="btn primary" id="cmp-insert-btn">插入短代码</button>
    </div>
  </div>
</div>
HTML;
        echo '<script src="' . $js . '"></script>';
    }
}
