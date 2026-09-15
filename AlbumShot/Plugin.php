<?php
/**
 * 图文融合：音乐相册章头视觉短代码，并注册到主题「组件插入」
 *
 * @package AlbumShot
 * @author Manueld
 * @version 1.8.0
 * @link https://github.com/AWildFunny/Plugins_for_Manueld-sBlog
 * @dependence 9.9.2-*
 */

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

class AlbumShot_Plugin implements Typecho_Plugin_Interface
{
    /** @var bool */
    private static $needsAssets = false;

    public static function activate()
    {
        // 必须在 Markdown 转换前保护短代码：相邻 [a][b] 会被当成引用链接吃掉
        Typecho_Plugin::factory('Widget_Abstract_Contents')->markdown = array('AlbumShot_Plugin', 'markdown');
        Typecho_Plugin::factory('Widget_Abstract_Contents')->contentEx = array('AlbumShot_Plugin', 'parse');
        Typecho_Plugin::factory('Widget_Archive')->header = array('AlbumShot_Plugin', 'header');
        Typecho_Plugin::factory('ComponentInserter')->collect = array('AlbumShot_Plugin', 'registerComponent');

        return _t('图文融合已启用。写文章侧栏「组件插入」可从附件库拖图到预览区。若从旧版升级，请禁用后再启用一次。');
    }

    public static function deactivate() {}

    public static function config(Typecho_Widget_Helper_Form $form) {}

    public static function personalConfig(Typecho_Widget_Helper_Form $form) {}

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
     * 收集可插入的图片附件（优先本文，再补近期其它）
     * @return array
     */
    private static function listImageAttachments()
    {
        $images = array();
        $seen = array();
        $cid = 0;
        if (isset($_REQUEST['cid'])) {
            $cid = intval($_REQUEST['cid']);
        }

        try {
            $db = Typecho_Db::get();
            $options = Helper::options();
            $uploadBase = defined('__TYPECHO_UPLOAD_URL__')
                ? rtrim(__TYPECHO_UPLOAD_URL__, '/') . '/'
                : rtrim($options->siteUrl, '/') . '/';

            $pushRow = function ($row) use (&$images, &$seen, $uploadBase) {
                if (empty($row['text'])) {
                    return;
                }
                $data = @unserialize($row['text']);
                if (!is_array($data) || empty($data['path'])) {
                    return;
                }
                $ext = strtolower(isset($data['type']) ? $data['type'] : pathinfo($data['path'], PATHINFO_EXTENSION));
                if (!in_array($ext, array('jpg', 'jpeg', 'gif', 'png', 'tiff', 'bmp', 'webp', 'avif'), true)) {
                    return;
                }
                $path = str_replace('\\', '/', $data['path']);
                // 与核心 Upload::attachmentHandle 默认逻辑一致
                if (class_exists('Typecho_Common')) {
                    $url = Typecho_Common::url(
                        $path,
                        defined('__TYPECHO_UPLOAD_URL__') ? __TYPECHO_UPLOAD_URL__ : Helper::options()->siteUrl
                    );
                } else {
                    $url = rtrim($uploadBase, '/') . '/' . ltrim($path, '/');
                }
                if (isset($seen[$url])) {
                    return;
                }
                $seen[$url] = true;
                $images[] = array(
                    'url' => $url,
                    'name' => isset($row['title']) && $row['title'] !== '' ? $row['title'] : basename($path),
                    'cid' => isset($row['cid']) ? intval($row['cid']) : 0,
                );
            };

            if ($cid > 0) {
                $mine = $db->fetchAll($db->select('cid', 'title', 'text')
                    ->from('table.contents')
                    ->where('type = ?', 'attachment')
                    ->where('parent = ?', $cid)
                    ->order('created', Typecho_Db::SORT_DESC)
                    ->limit(80));
                foreach ($mine as $row) {
                    $pushRow($row);
                }
            }

            $others = $db->fetchAll($db->select('cid', 'title', 'text')
                ->from('table.contents')
                ->where('type = ?', 'attachment')
                ->order('created', Typecho_Db::SORT_DESC)
                ->limit(100));
            foreach ($others as $row) {
                if (count($images) >= 120) {
                    break;
                }
                $pushRow($row);
            }
        } catch (Exception $e) {
        }

        return $images;
    }

    public static function registerComponent()
    {
        if (!self::loadCiRegistry()) {
            return;
        }

        $pluginUrl = Helper::options()->pluginUrl . '/AlbumShot/assets';
        $panelHtml = <<<'HTML'
<div class="as-workbench">
  <div class="as-toolbar">
    <p class="as-toolbar-row">
      <span>
        <label for="as-cat">分类</label>
        <select id="as-cat" class="w-100">
          <option value="single">单图 · 与标题排版</option>
          <option value="duo">双图</option>
          <option value="multi">多图</option>
          <option value="canvas">自由画布</option>
        </select>
      </span>
      <span id="as-layout-field">
        <label for="as-layout">版式</label>
        <select id="as-layout" class="w-100">
          <option value="auto">智能默认</option>
          <option value="banner">横幅</option>
          <option value="overlay">叠字封面</option>
          <option value="split-left">左图右文</option>
          <option value="split-right">左文右图</option>
          <option value="float">文绕图</option>
          <option value="custom">自定义</option>
        </select>
      </span>
      <span id="as-preset-field" hidden>
        <label for="as-preset">构图</label>
        <select id="as-preset" class="w-100">
          <option value="duo-split">左右对开</option>
          <option value="duo-main-side">主图 + 侧图</option>
          <option value="duo-overlap">轻微叠压</option>
          <option value="tri-stack">一大两小</option>
          <option value="tri-row">三联横排</option>
          <option value="quad">四宫错落</option>
          <option value="canvas">自由坐标</option>
        </select>
      </span>
      <span id="as-ratio-field" hidden>
        <label for="as-ratio">画幅</label>
        <select id="as-ratio" class="w-100">
          <option value="3:2">3:2</option>
          <option value="16:9">16:9</option>
          <option value="4:3">4:3</option>
          <option value="1:1">1:1</option>
          <option value="custom">自定义</option>
        </select>
        <span id="as-ratio-custom" class="as-ratio-custom" hidden>
          <input type="number" id="as-ratio-w" min="0.1" max="99" step="0.1" value="3" title="宽">
          <span class="as-ratio-colon">:</span>
          <input type="number" id="as-ratio-h" min="0.1" max="99" step="0.1" value="2" title="高">
        </span>
      </span>
    </p>
    <div id="as-custom-wrap" hidden>
      <p class="ci-inline-fields">
        <span>
          <label for="as-pos">图位置</label>
          <select id="as-pos" class="w-100">
            <option value="top">上</option>
            <option value="left">左</option>
            <option value="right">右</option>
            <option value="bg">作底</option>
          </select>
        </span>
        <span>
          <label for="as-titlepos">标题位置</label>
          <select id="as-titlepos" class="w-100">
            <option value="above">图上</option>
            <option value="on">叠在图上</option>
            <option value="beside">图旁</option>
            <option value="below">图下</option>
          </select>
        </span>
      </p>
      <p class="ci-check">
        <label><input type="checkbox" id="as-wrap"> 正文环绕图片</label>
      </p>
    </div>
    <p id="as-alt-wrap">
      <label for="as-alt">说明 / alt</label>
      <input type="text" id="as-alt" class="text w-100" placeholder="可选">
    </p>
    <p class="as-toolbar-actions">
      <button type="button" class="btn btn-xs" id="as-add-text">添加文字</button>
      <button type="button" class="btn btn-xs" id="as-lib-refresh">刷新附件库</button>
      <button type="button" class="btn btn-xs" id="as-board-clear" hidden>清空画布</button>
      <input type="hidden" id="as-src" value="">
    </p>
    <div id="as-text-bar" class="as-text-bar" hidden>
      <label>字号 <input type="number" id="as-text-fs" min="1.5" max="16" step="0.5" value="4.5" title="相对画幅宽度的百分比"></label>
      <label>颜色 <input type="color" id="as-text-color" value="#ffffff"></label>
      <select id="as-text-align" title="对齐">
        <option value="left">左齐</option>
        <option value="center">居中</option>
        <option value="right">右齐</option>
      </select>
      <label><input type="checkbox" id="as-text-bold" checked> 粗体</label>
      <label><input type="checkbox" id="as-text-shadow" checked> 阴影</label>
    </div>
    <p class="description as-drop-hint">从下方图库<strong>拖到左侧预览</strong>，或点击选用。「添加文字」可在画布上自由摆放。插入后会出现在下方历史里，点选即可继续改，再次插入会替换正文中的原块。</p>
    <p id="as-hist-status" class="as-hist-status" hidden></p>
  </div>
  <div class="as-history">
    <div class="as-lib-head">
      <span>历史 / 再编辑</span>
      <span id="as-hist-count" class="as-lib-count">0</span>
    </div>
    <div id="as-hist-list" class="as-hist-list"></div>
    <p id="as-hist-empty" class="as-lib-empty">插入过的图文会列在这里。点选加载到画布，改完再插入即可覆盖原文。</p>
  </div>
  <div class="as-lib">
    <div class="as-lib-head">
      <span>附件图片库</span>
      <span id="as-lib-count" class="as-lib-count">0</span>
    </div>
    <div id="as-lib-grid" class="as-lib-grid"></div>
    <p id="as-lib-empty" class="as-lib-empty" hidden>暂无图片附件。请先在文章右侧「附件」上传图片，再点「刷新附件库」。</p>
  </div>
</div>
HTML;

        ComponentInserter_Registry::register(array(
            'id' => 'album-shot',
            'label' => '图文融合',
            'order' => 15,
            'panelHtml' => $panelHtml,
            'boot' => array(
                'images' => self::listImageAttachments(),
            ),
            'css' => array($pluginUrl . '/admin-panel.css?ver=1.8.0'),
            'js' => array($pluginUrl . '/admin-panel.js?ver=1.8.0'),
        ));
    }

    /**
     * Markdown 转换前先把短代码变成 HTML，避免 [board][img] 被当成引用链接。
     */
    public static function markdown($text, $lastResult = null)
    {
        // 始终优先从原文解析短代码：其它 markdown 钩子若先跑，lastResult 里 [img] 可能已被当成引用链接吃掉
        $source = $text;
        if (stripos($source, '[album-board') === false && stripos($source, '[album-shot') === false) {
            $source = ($lastResult === null || $lastResult === '') ? $text : $lastResult;
        }
        $html = self::parse($source, null, null);
        if (class_exists('\\Utils\\Markdown')) {
            return \Utils\Markdown::convert($html);
        }
        if (class_exists('Markdown')) {
            return Markdown::convert($html);
        }
        return $html;
    }

    public static function parse($content, $widget, $lastResult)
    {
        $content = empty($lastResult) ? $content : $lastResult;
        if (stripos($content, '[album-shot') === false && stripos($content, '[album-board') === false) {
            return $content;
        }

        self::$needsAssets = true;
        $content = preg_replace('/<p>\s*(\[album-shot\b[^\]]*\])\s*<\/p>/i', '$1', $content);
        $content = preg_replace('/<div[^>]*>\s*(\[album-shot\b[^\]]*\])\s*<\/div>/i', '$1', $content);
        $content = preg_replace('/<p>\s*(\[album-board\b[\s\S]*?\[\/album-board\])\s*<\/p>/i', '$1', $content);
        $content = preg_replace('/<div[^>]*>\s*(\[album-board\b[\s\S]*?\[\/album-board\])\s*<\/div>/i', '$1', $content);

        $content = preg_replace_callback(
            '/\[album-board\b([^\]]*)\](.*?)\[\/album-board\]/is',
            array('AlbumShot_Plugin', 'renderBoard'),
            $content
        );

        $pattern = '/\[album-shot((?:\s+[a-zA-Z_][\w-]*\s*=\s*(?:"[^"]*"|\'[^\']*\'|&quot;.*?&quot;|[^\s\]]+))*)\s*\]/i';
        $content = preg_replace_callback($pattern, array('AlbumShot_Plugin', 'renderShot'), $content);
        return $content;
    }

    public static function renderBoard($matches)
    {
        $attrs = self::parseAttributes(isset($matches[1]) ? $matches[1] : '');
        $inner = isset($matches[2]) ? $matches[2] : '';
        $inner = html_entity_decode($inner, ENT_QUOTES, 'UTF-8');
        $ratio = isset($attrs['ratio']) ? trim($attrs['ratio']) : '3:2';
        if (!preg_match('/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/', $ratio, $rm)) {
            $ratio = '3:2';
            $rw = 3;
            $rh = 2;
        } else {
            $rw = $rm[1];
            $rh = $rm[2];
        }

        $items = array();
        if (preg_match_all('/\[img\b([^\]]*)\]|\[txt\b([^\]]*)\](.*?)\[\/txt\]/is', $inner, $im, PREG_SET_ORDER)) {
            foreach ($im as $row) {
                if (stripos($row[0], '[img') === 0) {
                    $ia = self::parseAttributes(isset($row[1]) ? $row[1] : '');
                    $src = isset($ia['src']) ? trim($ia['src']) : '';
                    if (!self::isSafeUrl($src)) {
                        continue;
                    }
                    $hRaw = isset($ia['h']) ? trim($ia['h']) : '';
                    $items[] = array(
                        'kind' => 'image',
                        'src' => $src,
                        'alt' => isset($ia['alt']) ? trim($ia['alt']) : '',
                        'x' => self::num($ia, 'x', 4),
                        'y' => self::num($ia, 'y', 4),
                        'w' => self::num($ia, 'w', 44),
                        'h' => $hRaw === '' ? 0 : self::num($ia, 'h', 0),
                        'ox' => self::num($ia, 'ox', 50),
                        'oy' => self::num($ia, 'oy', 50),
                        'zoom' => self::zoom($ia),
                    );
                    continue;
                }
                $ta = self::parseAttributes(isset($row[2]) ? $row[2] : '');
                $items[] = array(
                    'kind' => 'text',
                    'text' => isset($row[3]) ? $row[3] : '',
                    'x' => self::num($ta, 'x', 8),
                    'y' => self::num($ta, 'y', 12),
                    'w' => self::num($ta, 'w', 40),
                    'h' => self::num($ta, 'h', 18),
                    'fs' => self::fontSize($ta),
                    'color' => self::color(isset($ta['color']) ? $ta['color'] : '#ffffff'),
                    'align' => self::align(isset($ta['align']) ? $ta['align'] : 'left'),
                    'weight' => self::weight(isset($ta['weight']) ? $ta['weight'] : '700'),
                    'shadow' => !isset($ta['shadow']) || $ta['shadow'] === '' || !in_array(strtolower($ta['shadow']), array('0', 'false', 'no', 'off'), true),
                );
            }
        }
        if (empty($items) && preg_match_all('/<img\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\'][^>]*>/i', $inner, $hm, PREG_SET_ORDER)) {
            $n = count($hm);
            foreach ($hm as $i => $row) {
                $src = trim($row[1]);
                if (!self::isSafeUrl($src)) {
                    continue;
                }
                $items[] = array(
                    'kind' => 'image',
                    'src' => $src,
                    'alt' => '',
                    'x' => $n <= 1 ? 4 : ($i % 2 === 0 ? 2 : 51),
                    'y' => $n <= 2 ? 6 : (4 + (int) floor($i / 2) * 48),
                    'w' => $n <= 1 ? 92 : 47,
                    'h' => $n <= 2 ? 88 : 44,
                    'ox' => 50,
                    'oy' => 50,
                    'zoom' => 1,
                );
            }
        }
        if (empty($items)) {
            return '';
        }

        $ratioCss = htmlspecialchars($rw . ' / ' . $rh, ENT_QUOTES, 'UTF-8');
        $html = '<div class="album-board" data-ratio="' . htmlspecialchars($ratio, ENT_QUOTES, 'UTF-8') . '">';
        $html .= '<div class="album-board-stage" style="position:relative;width:100%;aspect-ratio:' . $ratioCss
            . ';overflow:hidden;container-type:inline-size;--board-ratio:' . $ratioCss . '">';
        foreach ($items as $item) {
            if (isset($item['kind']) && $item['kind'] === 'text') {
                $html .= self::renderBoardText($item);
            } else {
                $html .= self::renderBoardImage($item);
            }
        }
        $html .= '</div></div>';
        return $html;
    }

    private static function renderBoardImage($item)
    {
        $h = !empty($item['h']) ? $item['h'] : 55;
        $srcEsc = htmlspecialchars($item['src'], ENT_QUOTES, 'UTF-8');
        $altEsc = htmlspecialchars(isset($item['alt']) ? $item['alt'] : '', ENT_QUOTES, 'UTF-8');
        $ox = isset($item['ox']) ? $item['ox'] : 50;
        $oy = isset($item['oy']) ? $item['oy'] : 50;
        $zoom = isset($item['zoom']) ? $item['zoom'] : 1;
        $box = 'position:absolute;left:' . $item['x'] . '%;top:' . $item['y'] . '%;width:' . $item['w'] . '%;height:' . $h . '%;'
            . 'overflow:hidden;margin:0;padding:0;--ox:' . $ox . '%;--oy:' . $oy . '%;--zoom:' . $zoom . ';';
        $imgStyle = 'width:100%;height:100%;max-height:none;object-fit:cover;object-position:' . $ox . '% ' . $oy . '%;'
            . 'transform:scale(' . $zoom . ');transform-origin:' . $ox . '% ' . $oy . '%;display:block;';
        return '<figure class="album-board-item is-crop" style="' . $box . '">'
            . '<a data-fancybox="gallery" href="' . $srcEsc . '" data-caption="' . $altEsc . '" style="display:block;width:100%;height:100%;line-height:0">'
            . '<img src="' . $srcEsc . '" alt="' . $altEsc . '" style="' . $imgStyle . '">'
            . '</a></figure>';
    }

    private static function renderBoardText($item)
    {
        $color = self::color(isset($item['color']) ? $item['color'] : '#ffffff');
        $align = self::align(isset($item['align']) ? $item['align'] : 'left');
        $weight = self::weight(isset($item['weight']) ? $item['weight'] : '700');
        $fs = isset($item['fs']) ? floatval($item['fs']) : 4.5;
        if ($fs < 1.5) {
            $fs = 1.5;
        }
        if ($fs > 16) {
            $fs = 16;
        }
        $shadow = !empty($item['shadow'])
            ? 'text-shadow:0 1px 3px rgba(0,0,0,.55),0 0 12px rgba(0,0,0,.25);'
            : '';
        $text = isset($item['text']) ? $item['text'] : '';
        $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
        $text = strip_tags($text);
        $text = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
        $text = nl2br($text);
        $box = 'position:absolute;left:' . $item['x'] . '%;top:' . $item['y'] . '%;width:' . $item['w'] . '%;height:' . $item['h'] . '%;'
            . 'z-index:3;overflow:hidden;margin:0;padding:0.3em 0.4em;box-sizing:border-box;'
            . 'color:' . $color . ';text-align:' . $align . ';font-weight:' . $weight . ';'
            . 'font-size:calc(' . $fs . ' * 1cqw);line-height:1.35;white-space:pre-wrap;word-break:break-word;'
            . $shadow;
        return '<div class="album-board-text" style="' . $box . '">' . $text . '</div>';
    }

    private static function num($attrs, $key, $default)
    {
        if (!isset($attrs[$key]) || $attrs[$key] === '') {
            return $default;
        }
        $v = floatval($attrs[$key]);
        if ($v < 0) {
            $v = 0;
        }
        if ($v > 100) {
            $v = 100;
        }
        return round($v, 2);
    }

    private static function zoom($attrs)
    {
        if (!isset($attrs['zoom']) || $attrs['zoom'] === '') {
            return 1;
        }
        $v = floatval($attrs['zoom']);
        if ($v < 1) {
            $v = 1;
        }
        if ($v > 3) {
            $v = 3;
        }
        return round($v, 2);
    }

    private static function fontSize($attrs)
    {
        $v = isset($attrs['fs']) ? floatval($attrs['fs']) : 4.5;
        if ($v < 1.5) {
            $v = 1.5;
        }
        if ($v > 16) {
            $v = 16;
        }
        return round($v, 2);
    }

    private static function color($raw)
    {
        $raw = trim((string) $raw);
        if (preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $raw)) {
            return $raw;
        }
        return '#ffffff';
    }

    private static function align($raw)
    {
        $raw = strtolower(trim((string) $raw));
        return in_array($raw, array('left', 'center', 'right'), true) ? $raw : 'left';
    }

    private static function weight($raw)
    {
        $raw = strtolower(trim((string) $raw));
        if (in_array($raw, array('700', 'bold', 'bolder'), true)) {
            return '700';
        }
        return '400';
    }

    public static function renderShot($matches)
    {
        $attrs = self::parseAttributes(isset($matches[1]) ? $matches[1] : '');
        $src = isset($attrs['src']) ? trim($attrs['src']) : '';
        if (!self::isSafeUrl($src)) {
            return '';
        }

        $layout = isset($attrs['layout']) ? strtolower(trim($attrs['layout'])) : 'auto';
        $allowedLayout = array('auto', 'banner', 'overlay', 'split-left', 'split-right', 'float', 'custom');
        if (!in_array($layout, $allowedLayout, true)) {
            $layout = 'auto';
        }

        $pos = isset($attrs['pos']) ? strtolower(trim($attrs['pos'])) : '';
        $titlepos = isset($attrs['titlepos']) ? strtolower(trim($attrs['titlepos'])) : '';
        $wrap = isset($attrs['wrap']) ? strtolower(trim($attrs['wrap'])) : '';
        $alt = isset($attrs['alt']) ? trim($attrs['alt']) : '';
        $caption = isset($attrs['caption']) ? trim($attrs['caption']) : $alt;

        $srcEsc = htmlspecialchars($src, ENT_QUOTES, 'UTF-8');
        $altEsc = htmlspecialchars($alt, ENT_QUOTES, 'UTF-8');
        $captionEsc = htmlspecialchars($caption, ENT_QUOTES, 'UTF-8');
        $layoutEsc = htmlspecialchars($layout, ENT_QUOTES, 'UTF-8');

        $data = ' data-layout="' . $layoutEsc . '"';
        if ($pos !== '' && in_array($pos, array('top', 'left', 'right', 'bg'), true)) {
            $data .= ' data-pos="' . htmlspecialchars($pos, ENT_QUOTES, 'UTF-8') . '"';
        }
        if ($titlepos !== '' && in_array($titlepos, array('above', 'on', 'beside', 'below'), true)) {
            $data .= ' data-titlepos="' . htmlspecialchars($titlepos, ENT_QUOTES, 'UTF-8') . '"';
        }
        if (in_array($wrap, array('1', 'true', 'yes', 'on'), true)) {
            $data .= ' data-wrap="1"';
        }

        $html = '<figure class="album-shot"' . $data . '>';
        $html .= '<a data-fancybox="gallery" href="' . $srcEsc . '" data-caption="' . $captionEsc . '">';
        $html .= '<img src="' . $srcEsc . '" alt="' . $altEsc . '">';
        $html .= '</a>';
        if ($caption !== '' && $caption !== $alt) {
            $html .= '<figcaption>' . $captionEsc . '</figcaption>';
        }
        $html .= '</figure>';
        return $html;
    }

    private static function parseAttributes($raw)
    {
        $attrs = array();
        if ($raw === '' || $raw === null) {
            return $attrs;
        }
        $raw = html_entity_decode($raw, ENT_QUOTES, 'UTF-8');
        if (preg_match_all('/([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s\]]+))/', $raw, $m, PREG_SET_ORDER)) {
            foreach ($m as $match) {
                $key = strtolower($match[1]);
                $val = '';
                if (isset($match[2]) && $match[2] !== '') {
                    $val = $match[2];
                } elseif (isset($match[3]) && $match[3] !== '') {
                    $val = $match[3];
                } elseif (isset($match[4])) {
                    $val = $match[4];
                }
                $attrs[$key] = $val;
            }
        }
        return $attrs;
    }

    private static function isSafeUrl($url)
    {
        $url = trim($url);
        if ($url === '') {
            return false;
        }
        if (preg_match('#^https?://#i', $url)) {
            return true;
        }
        if (strpos($url, '/') === 0) {
            return true;
        }
        return false;
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
                if ($raw !== '' && (
                    stripos($raw, '[album-shot') !== false
                    || stripos($raw, '[album-board') !== false
                    || stripos($raw, 'album-board') !== false
                )) {
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
        $css = Helper::options()->pluginUrl . '/AlbumShot/assets/album-shot.css?ver=1.8.0';
        echo '<link rel="stylesheet" href="' . htmlspecialchars($css, ENT_QUOTES, 'UTF-8') . '">' . "\n";
    }
}
