<?php
/**
 * 贡献统计图表插件
 * 实现类似 GitHub 个人页面的贡献统计热力图
 * 
 * @package ContributionGraph
 * @author Manueld
 * @version 1.2.0
 * @link https://github.com/AWildFunny/Plugins_for_Manueld-sBlog
 * @dependence 9.9.2-*
 */

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

class ContributionGraph_Plugin implements Typecho_Plugin_Interface
{
    /**
     * 激活插件方法, 如果激活失败, 直接抛出异常
     * 
     * @access public
     * @return void
     * @throws Typecho_Plugin_Exception
     */
    public static function activate()
    {
        // 创建数据库表
        self::createTable();
        
        // 初始化历史贡献数据（可选）
        self::initHistoryContributions();
        
        // 注册钩子监听文章发布/修改
        Typecho_Plugin::factory('Widget_Contents_Post_Edit')->finishPublish = array('ContributionGraph_Plugin', 'recordContribution');
        
        // 注册钩子监听页面发布/修改
        Typecho_Plugin::factory('Widget_Contents_Page_Edit')->finishPublish = array('ContributionGraph_Plugin', 'recordContribution');
        
        // 注册钩子监听评论发布
        Typecho_Plugin::factory('Widget_Feedback')->finishComment = array('ContributionGraph_Plugin', 'recordContribution');
        
        // 解析短代码
        Typecho_Plugin::factory('Widget_Abstract_Contents')->contentEx = array('ContributionGraph_Plugin', 'parse');
        
        // 在页面头部输出CSS
        Typecho_Plugin::factory('Widget_Archive')->header = array('ContributionGraph_Plugin', 'header');
        
        // 在页面底部输出JavaScript
        Typecho_Plugin::factory('Widget_Archive')->footer = array('ContributionGraph_Plugin', 'footer');

        // 组件插入面板
        Typecho_Plugin::factory('ComponentInserter')->collect = array('ContributionGraph_Plugin', 'registerComponent');
        
        return _t('贡献统计图表插件已激活');
    }
    
    /**
     * 禁用插件方法, 如果禁用失败, 直接抛出异常
     * 
     * @static
     * @access public
     * @return void
     * @throws Typecho_Plugin_Exception
     */
    public static function deactivate()
    {
        // 可选：禁用时删除数据表
        // self::dropTable();
    }
    
    /**
     * 获取插件配置面板
     * 
     * @access public
     * @param Typecho_Widget_Helper_Form $form 配置面板
     * @return void
     */
    public static function config(Typecho_Widget_Helper_Form $form)
    {
        // 是否追踪文章发布
        $trackPostPublish = new Typecho_Widget_Helper_Form_Element_Radio(
            'trackPostPublish',
            array('1' => '是', '0' => '否'),
            '1',
            _t('追踪文章发布'),
            _t('是否记录文章发布操作作为贡献')
        );
        $form->addInput($trackPostPublish);
        
        // 是否追踪文章修改
        $trackPostModify = new Typecho_Widget_Helper_Form_Element_Radio(
            'trackPostModify',
            array('1' => '是', '0' => '否'),
            '1',
            _t('追踪文章修改'),
            _t('是否记录文章修改操作作为贡献')
        );
        $form->addInput($trackPostModify);
        
        // 是否追踪页面发布/修改
        $trackPage = new Typecho_Widget_Helper_Form_Element_Radio(
            'trackPage',
            array('1' => '是', '0' => '否'),
            '1',
            _t('追踪页面发布/修改'),
            _t('是否记录页面发布/修改操作作为贡献')
        );
        $form->addInput($trackPage);
        
        // 是否追踪评论
        $trackComment = new Typecho_Widget_Helper_Form_Element_Radio(
            'trackComment',
            array('1' => '是', '0' => '否'),
            '0',
            _t('追踪评论'),
            _t('是否记录评论发布操作作为贡献')
        );
        $form->addInput($trackComment);
        
        // 默认显示年份
        $defaultYear = new Typecho_Widget_Helper_Form_Element_Text(
            'defaultYear',
            null,
            date('Y'),
            _t('默认显示年份'),
            _t('短代码中未指定年份时使用的默认年份')
        );
        $form->addInput($defaultYear);
        
        // 默认显示布局
        $defaultLayout = new Typecho_Widget_Helper_Form_Element_Radio(
            'defaultLayout',
            array(
                'year' => '全年顺序（1–12 月）',
                'centered' => '以今日居中'
            ),
            'year',
            _t('默认显示布局'),
            _t('短代码未指定 layout 时使用。year=自然年 1–12 月；centered=约 53 周并以今天所在周居中。')
        );
        $form->addInput($defaultLayout);

        // 说明区域内容
        $description = new Typecho_Widget_Helper_Form_Element_Textarea(
            'description',
            null,
            '贡献统计基于您在博客中的操作记录，包括内容发布、修改等活动。这些数据可以帮助您了解自己的博客维护频率和活跃度。',
            _t('说明区域内容'),
            _t('显示在贡献图表下方的说明文字，支持HTML标签')
        );
        $form->addInput($description);
    }
    
    /**
     * 个人用户的配置面板
     * 
     * @access public
     * @param Typecho_Widget_Helper_Form $form
     * @return void
     */
    public static function personalConfig(Typecho_Widget_Helper_Form $form){}

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
     * 向组件插入壳注册贡献图组件
     */
    public static function registerComponent()
    {
        if (!self::loadCiRegistry()) {
            return;
        }

        $year = date('Y');
        $layout = 'year';
        try {
            $plugin = Helper::options()->plugin('ContributionGraph');
            if (!empty($plugin->defaultYear) && preg_match('/^\d{4}$/', trim($plugin->defaultYear))) {
                $year = trim($plugin->defaultYear);
            }
            if (!empty($plugin->defaultLayout) && in_array($plugin->defaultLayout, array('year', 'centered'), true)) {
                $layout = $plugin->defaultLayout;
            }
        } catch (Exception $e) {
        }

        $yearEsc = htmlspecialchars($year, ENT_QUOTES, 'UTF-8');
        $yearChecked = $layout === 'year' ? ' checked' : '';
        $centeredChecked = $layout === 'centered' ? ' checked' : '';
        $panelHtml = <<<HTML
<p>
  <label>显示布局</label>
  <span class="ci-check" style="display:block;margin-top:6px">
    <label><input type="radio" name="cg-layout" id="cg-layout-year" value="year"{$yearChecked}> 全年顺序（1–12 月）</label>
  </span>
  <span class="ci-check" style="display:block;margin-top:4px">
    <label><input type="radio" name="cg-layout" id="cg-layout-centered" value="centered"{$centeredChecked}> 以今日居中</label>
  </span>
  <span class="description">全年：固定自然年日历；居中：约 53 周，今天所在周在正中。</span>
</p>
<p id="cg-year-wrap">
  <label for="cg-year">显示年份</label>
  <input type="number" id="cg-year" class="text w-100" min="2000" max="2100" value="{$yearEsc}">
  <span class="description">仅「全年顺序」时有效；留空则用插件默认年份。</span>
</p>
<p class="description">短代码示例：<code>[ContributionGraph layout="year"]</code>、<code>[ContributionGraph layout="centered"]</code></p>
HTML;

        $pluginUrl = Helper::options()->pluginUrl . '/ContributionGraph';
        ComponentInserter_Registry::register(array(
            'id' => 'contribution',
            'label' => '贡献图',
            'order' => 30,
            'panelHtml' => $panelHtml,
            'boot' => array(
                'defaultYear' => $year,
                'defaultLayout' => $layout,
            ),
            'js' => array($pluginUrl . '/admin-panel.js?ver=1.2.0'),
        ));
    }
    
    /**
     * 创建数据库表
     * 
     * @access private
     * @return void
     */
    private static function createTable()
    {
        $db = Typecho_Db::get();
        $prefix = $db->getPrefix();
        
        $sql = "CREATE TABLE IF NOT EXISTS `{$prefix}contributions` (
            `date` DATE NOT NULL PRIMARY KEY,
            `count` INT UNSIGNED DEFAULT 1,
            INDEX `idx_date` (`date`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
        
        try {
            $db->query($sql);
        } catch (Exception $e) {
            throw new Typecho_Plugin_Exception('创建贡献统计表失败: ' . $e->getMessage());
        }
    }
    
    /**
     * 删除数据库表（可选）
     * 
     * @access private
     * @return void
     */
    private static function dropTable()
    {
        $db = Typecho_Db::get();
        $prefix = $db->getPrefix();
        $db->query("DROP TABLE IF EXISTS `{$prefix}contributions`");
    }
    
    /**
     * 初始化历史贡献数据
     * 从现有数据库记录中统计历史贡献
     * 
     * @access private
     * @return void
     */
    private static function initHistoryContributions()
    {
        $db = Typecho_Db::get();
        
        // 检查是否已经初始化过（通过检查表中是否有数据）
        $existing = $db->fetchRow($db->select('COUNT(*) as cnt')
            ->from('table.contributions')
            ->limit(1));
        
        if ($existing && $existing['cnt'] > 0) {
            // 已经有数据，跳过初始化
            return;
        }
        
        // 尝试获取插件配置，如果不存在则使用默认值
        try {
            $options = Typecho_Widget::widget('Widget_Options');
            $pluginOptions = $options->plugin('ContributionGraph');
            $trackPostPublish = !empty($pluginOptions->trackPostPublish);
            $trackPostModify = !empty($pluginOptions->trackPostModify);
            $trackPage = !empty($pluginOptions->trackPage);
            $trackComment = !empty($pluginOptions->trackComment);
        } catch (Exception $e) {
            // 如果配置不存在，使用默认值（全部启用）
            $trackPostPublish = true;
            $trackPostModify = true;
            $trackPage = true;
            $trackComment = false;
        }
        
        $contributions = array();
        
        // 统计文章发布（如果启用）
        if ($trackPostPublish) {
            $posts = $db->fetchAll($db->select('created')
                ->from('table.contents')
                ->where('type = ?', 'post')
                ->where('status = ?', 'publish'));
            
            foreach ($posts as $post) {
                if ($post['created'] > 0) {
                    $date = date('Y-m-d', $post['created']);
                    if (!isset($contributions[$date])) {
                        $contributions[$date] = 0;
                    }
                    $contributions[$date]++;
                }
            }
        }
        
        // 统计文章修改（如果启用）
        if ($trackPostModify) {
            $posts = $db->fetchAll($db->select('modified', 'created')
                ->from('table.contents')
                ->where('type = ?', 'post')
                ->where('status = ?', 'publish'));
            
            foreach ($posts as $post) {
                if ($post['modified'] > 0 && $post['modified'] != $post['created']) {
                    $date = date('Y-m-d', $post['modified']);
                    if (!isset($contributions[$date])) {
                        $contributions[$date] = 0;
                    }
                    $contributions[$date]++;
                }
            }
        }
        
        // 统计页面发布/修改（如果启用）
        if ($trackPage) {
            $pages = $db->fetchAll($db->select('created', 'modified')
                ->from('table.contents')
                ->where('type = ?', 'page')
                ->where('status = ?', 'publish'));
            
            foreach ($pages as $page) {
                if ($page['created'] > 0) {
                    $date = date('Y-m-d', $page['created']);
                    if (!isset($contributions[$date])) {
                        $contributions[$date] = 0;
                    }
                    $contributions[$date]++;
                }
                
                if ($page['modified'] > 0 && $page['modified'] != $page['created']) {
                    $date = date('Y-m-d', $page['modified']);
                    if (!isset($contributions[$date])) {
                        $contributions[$date] = 0;
                    }
                    $contributions[$date]++;
                }
            }
        }
        
        // 统计评论（如果启用）
        if ($trackComment) {
            $comments = $db->fetchAll($db->select('created')
                ->from('table.comments')
                ->where('status = ?', 'approved'));
            
            foreach ($comments as $comment) {
                if ($comment['created'] > 0) {
                    $date = date('Y-m-d', $comment['created']);
                    if (!isset($contributions[$date])) {
                        $contributions[$date] = 0;
                    }
                    $contributions[$date]++;
                }
            }
        }
        
        // 批量插入贡献数据
        foreach ($contributions as $date => $count) {
            try {
                $db->query($db->insert('table.contributions')
                    ->rows(array(
                        'date' => $date,
                        'count' => $count
                    )));
            } catch (Exception $e) {
                // 如果日期已存在，则更新计数
                $db->query($db->update('table.contributions')
                    ->expression('count', 'count + ' . intval($count), false)
                    ->where('date = ?', $date));
            }
        }
    }
    
    /**
     * 记录贡献
     * 
     * @access public
     * @param mixed $content 内容对象（对于finishComment钩子，此参数为null）
     * @param mixed $widget 组件对象
     * @return void
     */
    public static function recordContribution($content, $widget)
    {
        $options = Typecho_Widget::widget('Widget_Options');
        $pluginOptions = $options->plugin('ContributionGraph');
        
        // 检查是否应该追踪此操作
        $shouldTrack = false;
        $timestamp = $options->time;
        
        // 处理评论钩子（finishComment只接收一个参数）
        if ($content === null && $widget instanceof Widget_Feedback) {
            // 评论操作
            if (!empty($pluginOptions->trackComment)) {
                $shouldTrack = true;
                // 从评论对象获取创建时间
                if (isset($widget->row['created']) && $widget->row['created'] > 0) {
                    $timestamp = $widget->row['created'];
                }
            }
        } elseif ($widget instanceof Widget_Contents_Post_Edit) {
            // 文章操作
            // 检查是新建还是修改：如果widget已经有cid且created时间与当前时间相差较大，说明是修改
            if ($widget->have() && $widget->cid) {
                $created = $widget->created;
                $now = $options->time;
                // 如果创建时间与当前时间相差超过1小时，认为是修改
                if ($created > 0 && ($now - $created) > 3600) {
                    // 修改操作
                    if (!empty($pluginOptions->trackPostModify)) {
                        $shouldTrack = true;
                    }
                } else {
                    // 新建操作
                    if (!empty($pluginOptions->trackPostPublish)) {
                        $shouldTrack = true;
                    }
                }
            } else {
                // 新建操作
                if (!empty($pluginOptions->trackPostPublish)) {
                    $shouldTrack = true;
                }
            }
        } elseif ($widget instanceof Widget_Contents_Page_Edit) {
            // 页面操作
            if (!empty($pluginOptions->trackPage)) {
                $shouldTrack = true;
            }
        }
        
        if (!$shouldTrack) {
            return;
        }
        
        // 获取操作日期（Y-m-d格式）
        $date = date('Y-m-d', $timestamp);
        
        // 记录到数据库
        $db = Typecho_Db::get();
        
        // 检查该日期是否已存在
        $existing = $db->fetchRow($db->select('count')
            ->from('table.contributions')
            ->where('date = ?', $date)
            ->limit(1));
        
        if ($existing) {
            // 更新计数
            $db->query($db->update('table.contributions')
                ->expression('count', 'count + 1', false)
                ->where('date = ?', $date));
        } else {
            // 插入新记录
            $db->query($db->insert('table.contributions')
                ->rows(array(
                    'date' => $date,
                    'count' => 1
                )));
        }
    }
    
    /**
     * 解析内容里的短代码
     * 
     * @access public
     * @param string $content 文章内容
     * @param Widget_Abstract_Contents $widget 文章组件
     * @param string $lastResult 上一个插件处理的结果
     * @return string
     */
    public static function parse($content, $widget, $lastResult)
    {
        $content = empty($lastResult) ? $content : $lastResult;

        // [ContributionGraph] / [ContributionGraph year="2025"] / [ContributionGraph layout="centered"]
        // 兼容 Markdown 转义后的 &quot;
        $pattern = '/\[ContributionGraph((?:\s+[a-zA-Z_][\w-]*\s*=\s*(?:"[^"]*"|\'[^\']*\'|&quot;.*?&quot;|[^\s\]]+))*)\s*\]/i';

        $content = preg_replace_callback($pattern, function ($matches) {
            $attrs = self::parseShortcodeAttrs(isset($matches[1]) ? $matches[1] : '');
            $year = null;
            if (!empty($attrs['year']) && preg_match('/^\d{4}$/', $attrs['year'])) {
                $year = intval($attrs['year']);
            }
            $layout = null;
            if (!empty($attrs['layout'])) {
                $layout = strtolower(trim($attrs['layout']));
            }
            return self::renderGraph($year, $layout);
        }, $content);

        return $content;
    }

    /**
     * 解析短代码属性
     * @param string $raw
     * @return array<string,string>
     */
    private static function parseShortcodeAttrs($raw)
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

    /**
     * 渲染贡献图表
     *
     * @access private
     * @param int|null $year 年份，null 表示使用默认年份（仅 year 布局）
     * @param string|null $layout year|centered
     * @return string HTML代码
     */
    private static function renderGraph($year = null, $layout = null)
    {
        $options = Typecho_Widget::widget('Widget_Options');
        $pluginOptions = $options->plugin('ContributionGraph');

        if ($layout === null || ($layout !== 'year' && $layout !== 'centered')) {
            $layout = !empty($pluginOptions->defaultLayout) ? $pluginOptions->defaultLayout : 'year';
        }
        if ($layout !== 'year' && $layout !== 'centered') {
            $layout = 'year';
        }

        if ($layout === 'centered') {
            $range = self::getCenteredRange();
            $contributions = self::getContributionsRange($range['start'], $range['end']);
            $graphId = 'contribution-graph-' . uniqid();
            $title = '贡献统计（今日居中）';
            $subtitle = htmlspecialchars($range['start'] . ' ~ ' . $range['end'], ENT_QUOTES, 'UTF-8');
            $total = array_sum($contributions);

            $html = '<div class="contribution-graph-container" id="' . htmlspecialchars($graphId) . '" data-layout="centered" data-start="' . htmlspecialchars($range['start'], ENT_QUOTES, 'UTF-8') . '" data-end="' . htmlspecialchars($range['end'], ENT_QUOTES, 'UTF-8') . '">';
            $html .= '<div class="contribution-graph-header">';
            $html .= '<h3 class="contribution-graph-title">' . $title . '</h3>';
            $html .= '<div class="contribution-graph-total">共 ' . $total . ' 次贡献 · ' . $subtitle . '</div>';
            $html .= '</div>';
            $html .= '<div class="contribution-graph">';
            $html .= self::generateHeatmapRange($contributions, $range);
            $html .= '</div>';
            $html .= '<div class="contribution-graph-footer">';
            $html .= '<div class="contribution-graph-legend">';
            $html .= '<span class="legend-label">少</span>';
            $html .= '<div class="legend-squares">';
            $html .= '<div class="legend-square" data-level="0"></div>';
            $html .= '<div class="legend-square" data-level="1"></div>';
            $html .= '<div class="legend-square" data-level="2"></div>';
            $html .= '<div class="legend-square" data-level="3"></div>';
            $html .= '</div>';
            $html .= '<span class="legend-label">多</span>';
            $html .= '</div>';
            $html .= self::generateDescription($pluginOptions);
            $html .= '</div>';
            $html .= '</div>';
            return $html;
        }

        if ($year === null) {
            $year = !empty($pluginOptions->defaultYear) ? intval($pluginOptions->defaultYear) : date('Y');
        }

        $contributions = self::getContributions($year);
        $graphId = 'contribution-graph-' . uniqid();

        $html = '<div class="contribution-graph-container" id="' . htmlspecialchars($graphId) . '" data-year="' . $year . '" data-layout="year">';
        $html .= '<div class="contribution-graph-header">';
        $html .= '<h3 class="contribution-graph-title">' . $year . ' 年贡献统计</h3>';
        $html .= '<div class="contribution-graph-total">共 ' . array_sum($contributions) . ' 次贡献</div>';
        $html .= '</div>';
        $html .= '<div class="contribution-graph">';
        $html .= self::generateHeatmap($contributions, $year);
        $html .= '</div>';
        $html .= '<div class="contribution-graph-footer">';
        $html .= '<div class="contribution-graph-legend">';
        $html .= '<span class="legend-label">少</span>';
        $html .= '<div class="legend-squares">';
        $html .= '<div class="legend-square" data-level="0"></div>';
        $html .= '<div class="legend-square" data-level="1"></div>';
        $html .= '<div class="legend-square" data-level="2"></div>';
        $html .= '<div class="legend-square" data-level="3"></div>';
        $html .= '</div>';
        $html .= '<span class="legend-label">多</span>';
        $html .= '</div>';
        $html .= self::generateDescription($pluginOptions);
        $html .= '</div>';
        $html .= '</div>';

        return $html;
    }
    
    /**
     * 生成说明区域
     * 
     * @access private
     * @param object $pluginOptions 插件配置选项
     * @return string HTML代码
     */
    private static function generateDescription($pluginOptions)
    {
        $description = !empty($pluginOptions->description) ? $pluginOptions->description : '';
        
        if (empty($description)) {
            return '';
        }
        
        // 允许HTML标签，但进行基本的安全处理
        // 移除危险的标签和属性，保留基本的格式化标签
        $allowedTags = '<p><br><strong><em><u><a><ul><ol><li><h1><h2><h3><h4><h5><h6><blockquote><code><pre>';
        $description = strip_tags($description, $allowedTags);
        
        // 转义HTML，用于data属性
        $descriptionEscaped = htmlspecialchars($description, ENT_QUOTES, 'UTF-8');
        
        $html = '<div class="contribution-graph-description">';
        $html .= '<button class="description-button" type="button" aria-label="这是什么">';
        $html .= '<span class="description-label">这是什么</span>';
        $html .= '<span class="description-icon">?</span>';
        $html .= '<div class="description-tooltip">';
        $html .= '<span class="description-tooltip-text">' . $description . '</span>';
        $html .= '</div>';
        $html .= '</button>';
        $html .= '</div>';
        
        return $html;
    }
    
    /**
     * 获取指定年份的贡献数据
     * 
     * @access private
     * @param int $year 年份
     * @return array 日期 => 贡献次数的数组
     */
    private static function getContributions($year)
    {
        $db = Typecho_Db::get();
        
        $startDate = $year . '-01-01';
        $endDate = $year . '-12-31';
        
        $rows = $db->fetchAll($db->select('date', 'count')
            ->from('table.contributions')
            ->where('date >= ?', $startDate)
            ->where('date <= ?', $endDate));
        
        $contributions = array();
        foreach ($rows as $row) {
            $contributions[$row['date']] = intval($row['count']);
        }
        
        return $contributions;
    }

    /**
     * 按日期区间取贡献
     * @param string $startDate Y-m-d
     * @param string $endDate Y-m-d
     * @return array
     */
    private static function getContributionsRange($startDate, $endDate)
    {
        $db = Typecho_Db::get();
        $rows = $db->fetchAll($db->select('date', 'count')
            ->from('table.contributions')
            ->where('date >= ?', $startDate)
            ->where('date <= ?', $endDate));

        $contributions = array();
        foreach ($rows as $row) {
            $contributions[$row['date']] = intval($row['count']);
        }
        return $contributions;
    }

    /**
     * 计算「今日居中」的周对齐区间（默认 53 周，今日所在周在正中）
     * @return array{start:string,end:string,totalWeeks:int,rangeStartTs:int,today:string}
     */
    private static function getCenteredRange()
    {
        $totalWeeks = 53;
        $centerWeek = (int) floor($totalWeeks / 2); // 26
        $todayTs = strtotime('today');
        $todayDow = (int) date('w', $todayTs); // 0=Sun
        $weekStartToday = strtotime('-' . $todayDow . ' days', $todayTs);
        $rangeStartTs = strtotime('-' . $centerWeek . ' weeks', $weekStartToday);
        $rangeEndTs = strtotime('+' . (($totalWeeks * 7) - 1) . ' days', $rangeStartTs);

        return array(
            'start' => date('Y-m-d', $rangeStartTs),
            'end' => date('Y-m-d', $rangeEndTs),
            'totalWeeks' => $totalWeeks,
            'rangeStartTs' => $rangeStartTs,
            'today' => date('Y-m-d', $todayTs),
        );
    }
    
    /**
     * 生成热力图（自然年 1–12 月）
     * 
     * @access private
     * @param array $contributions 贡献数据
     * @param int $year 年份
     * @return string HTML代码
     */
    private static function generateHeatmap($contributions, $year)
    {
        // 计算该年份的第一天是星期几（0=周日, 1=周一, ...）
        $firstDay = strtotime($year . '-01-01');
        $dayOfWeek = date('w', $firstDay); // 0-6, 0是周日
        // 周日作为一周的开始，offset就是dayOfWeek本身
        $offset = $dayOfWeek;
        
        // 计算该年份有多少天
        $daysInYear = date('z', strtotime($year . '-12-31')) + 1;
        
        // 计算实际需要的周数（考虑偏移）
        $totalWeeks = ceil(($daysInYear + $offset) / 7);
        if ($totalWeeks > 53) {
            $totalWeeks = 53;
        }
        
        // 定义常量
        $squareSize = 11;
        $squareMargin = 2;
        $squareTotal = $squareSize + $squareMargin * 2; // 15px
        $weekLabelWidth = 30;
        $monthLabelHeight = 15;
        
        // 生成月份标签
        $months = array('1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月');
        $monthLabels = array();
        
        // 记录每个月份的第一周位置
        for ($month = 1; $month <= 12; $month++) {
            $monthFirstDay = strtotime($year . '-' . sprintf('%02d', $month) . '-01');
            $dayOfYear = date('z', $monthFirstDay);
            // 计算该日期所在的周
            $week = floor(($dayOfYear + $offset) / 7);
            if ($week >= 0 && $week < $totalWeeks) {
                if (!isset($monthLabels[$week])) {
                    $monthLabels[$week] = $months[$month - 1];
                }
            }
        }
        
        // 生成热力图容器（使用绝对定位）
        $html = '<div class="contribution-graph-heatmap-wrapper">';
        
        // 生成月份标签（绝对定位）
        foreach ($monthLabels as $week => $monthLabel) {
            $left = $weekLabelWidth + $week * $squareTotal;
            $html .= '<div class="month-label" style="left: ' . $left . 'px;">' . htmlspecialchars($monthLabel) . '</div>';
        }
        
        // 生成星期标签（绝对定位）
        // 周日=0, 周一=1, 周二=2, 周三=3, 周四=4, 周五=5, 周六=6
        // 显示：周一、周三、周五
        // 周标签的行位置就是对应的day值（1=周一，3=周三，5=周五）
        // 因为方块的位置计算是：top = monthLabelHeight + day * squareTotal
        // 所以周标签也应该使用相同的day值来计算位置
        $weekLabelMap = array(1 => '周一', 3 => '周三', 5 => '周五');
        foreach ($weekLabelMap as $day => $label) {
            $top = $monthLabelHeight + $day * $squareTotal;
            $html .= '<div class="week-label" style="top: ' . $top . 'px;">' . htmlspecialchars($label) . '</div>';
        }
        
        // 生成热力图网格（绝对定位）
        for ($week = 0; $week < $totalWeeks; $week++) {
            for ($day = 0; $day < 7; $day++) {
                $dayIndex = $week * 7 + $day - $offset;
                
                // 计算位置
                $left = $weekLabelWidth + $week * $squareTotal + $squareMargin;
                $top = $monthLabelHeight + $day * $squareTotal + $squareMargin;
                
                if ($dayIndex < 0 || $dayIndex >= $daysInYear) {
                    // 不在该年份范围内的日期，显示空白
                    $html .= '<div class="contribution-day empty" style="left: ' . $left . 'px; top: ' . $top . 'px;"></div>';
                } else {
                    $date = date('Y-m-d', strtotime($year . '-01-01 +' . $dayIndex . ' days'));
                    $count = isset($contributions[$date]) ? $contributions[$date] : 0;
                    $level = self::getContributionLevel($count);
                    
                    $html .= '<div class="contribution-day level-' . $level . '" ';
                    $html .= 'style="left: ' . $left . 'px; top: ' . $top . 'px;" ';
                    $html .= 'data-date="' . htmlspecialchars($date) . '" ';
                    $html .= 'data-count="' . $count . '" ';
                    $html .= 'title="' . htmlspecialchars($date . ': ' . $count . ' 次贡献') . '">';
                    $html .= '</div>';
                }
            }
        }
        
        $html .= '</div>';
        
        return $html;
    }

    /**
     * 生成「今日居中」热力图
     *
     * @param array $contributions
     * @param array $range getCenteredRange() 返回值
     * @return string
     */
    private static function generateHeatmapRange($contributions, $range)
    {
        $squareSize = 11;
        $squareMargin = 2;
        $squareTotal = $squareSize + $squareMargin * 2;
        $weekLabelWidth = 30;
        $monthLabelHeight = 15;
        $totalWeeks = (int) $range['totalWeeks'];
        $rangeStartTs = (int) $range['rangeStartTs'];
        $today = $range['today'];

        $monthLabels = array();
        $lastMonthKey = '';
        for ($week = 0; $week < $totalWeeks; $week++) {
            $ts = strtotime('+' . ($week * 7) . ' days', $rangeStartTs);
            $monthKey = date('Y-n', $ts);
            if ($monthKey !== $lastMonthKey) {
                $monthLabels[$week] = intval(date('n', $ts)) . '月';
                $lastMonthKey = $monthKey;
            }
        }

        $width = $weekLabelWidth + $totalWeeks * $squareTotal;
        $html = '<div class="contribution-graph-heatmap-wrapper" style="width:' . $width . 'px">';

        foreach ($monthLabels as $week => $monthLabel) {
            $left = $weekLabelWidth + $week * $squareTotal;
            $html .= '<div class="month-label" style="left: ' . $left . 'px;">' . htmlspecialchars($monthLabel) . '</div>';
        }

        $weekLabelMap = array(1 => '周一', 3 => '周三', 5 => '周五');
        foreach ($weekLabelMap as $day => $label) {
            $top = $monthLabelHeight + $day * $squareTotal;
            $html .= '<div class="week-label" style="top: ' . $top . 'px;">' . htmlspecialchars($label) . '</div>';
        }

        for ($week = 0; $week < $totalWeeks; $week++) {
            for ($day = 0; $day < 7; $day++) {
                $ts = strtotime('+' . ($week * 7 + $day) . ' days', $rangeStartTs);
                $date = date('Y-m-d', $ts);
                $left = $weekLabelWidth + $week * $squareTotal + $squareMargin;
                $top = $monthLabelHeight + $day * $squareTotal + $squareMargin;
                $count = isset($contributions[$date]) ? $contributions[$date] : 0;
                $level = self::getContributionLevel($count);
                $isToday = ($date === $today);
                $extraClass = $isToday ? ' is-today' : '';

                $html .= '<div class="contribution-day level-' . $level . $extraClass . '" ';
                $html .= 'style="left: ' . $left . 'px; top: ' . $top . 'px;" ';
                $html .= 'data-date="' . htmlspecialchars($date) . '" ';
                $html .= 'data-count="' . $count . '" ';
                $html .= 'title="' . htmlspecialchars($date . ': ' . $count . ' 次贡献' . ($isToday ? '（今天）' : '')) . '">';
                $html .= '</div>';
            }
        }

        $html .= '</div>';
        return $html;
    }
    
    /**
     * 获取贡献等级（0-3）
     * 
     * @access private
     * @param int $count 贡献次数
     * @return int 等级 0-3
     */
    private static function getContributionLevel($count)
    {
        if ($count == 0) {
            return 0;
        } elseif ($count <= 3) {
            return 1;
        } elseif ($count <= 9) {
            return 2;
        } else {
            return 3;
        }
    }
    
    /**
     * 在头部输出CSS
     * 
     * @access public
     * @return void
     */
    public static function header()
    {
        echo self::getStyles();
    }
    
    /**
     * 在底部输出JavaScript
     * 
     * @access public
     * @return void
     */
    public static function footer()
    {
        echo self::getScripts();
    }
    
    /**
     * 获取CSS样式
     * 
     * @access private
     * @return string CSS代码
     */
    private static function getStyles()
    {
        return '<style>
.contribution-graph-container {
    margin: 20px 0;
    padding: 20px;
    background: #fff;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    position: relative;
}

.contribution-day-tooltip {
    position: fixed;
    background: #24292e;
    color: #fff;
    padding: 5px 8px;
    border-radius: 3px;
    font-size: 12px;
    white-space: nowrap;
    z-index: 10000;
    pointer-events: none;
}

.contribution-graph-header {
    margin-bottom: 15px;
}

.contribution-graph-title {
    margin: 0 0 5px 0;
    font-size: 16px;
    font-weight: 600;
    color: #24292e;
}

.contribution-graph-total {
    font-size: 14px;
    color: #586069;
}

.contribution-graph {
    position: relative;
    overflow-x: auto;
}

.contribution-graph-heatmap-wrapper {
    position: relative;
    width: calc(30px + 53 * 15px); /* 周标签宽度 + 53周 * 15px */
    height: calc(15px + 7 * 15px); /* 月份标签高度 + 7行 * 15px */
    min-width: 100%;
}

.month-label {
    position: absolute;
    font-size: 12px;
    color: #586069;
    height: 15px;
    line-height: 15px;
    top: 0;
    white-space: nowrap;
}

.week-label {
    position: absolute;
    font-size: 12px;
    color: #586069;
    height: 15px;
    line-height: 15px;
    width: 30px;
    left: 0;
    text-align: right;
    padding-right: 4px;
}

.contribution-day {
    position: absolute;
    width: 11px;
    height: 11px;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.contribution-day.empty {
    background: transparent;
}

.contribution-day.level-0 {
    background: #ebedf0;
}

.contribution-day.level-1 {
    background: #9be9a8;
}

.contribution-day.level-2 {
    background: #40c463;
}

.contribution-day.level-3 {
    background: #30a14e;
}

.contribution-day:hover {
    outline: 1px solid rgba(0, 0, 0, 0.5);
    outline-offset: -1px;
}

.contribution-day.is-today {
    outline: 2px solid #4E7289;
    outline-offset: -1px;
}

.contribution-graph-footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-top: 10px;
    gap: 20px;
}

.contribution-graph-legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    font-size: 12px;
    color: #586069;
    flex-shrink: 0;
}

.legend-label {
    margin: 0 5px;
}

.legend-squares {
    display: flex;
    gap: 3px;
}

.legend-square {
    width: 11px;
    height: 11px;
    border-radius: 2px;
}

.legend-square[data-level="0"] {
    background: #ebedf0;
}

.legend-square[data-level="1"] {
    background: #9be9a8;
}

.legend-square[data-level="2"] {
    background: #40c463;
}

 .legend-square[data-level="3"] {
     background: #30a14e;
 }
 
 .contribution-graph-description {
     flex-shrink: 0;
 }
 
 .description-button {
     background: none;
     border: none;
     cursor: pointer;
     padding: 0;
     display: flex;
     align-items: center;
     gap: 4px;
     color: #586069;
     font-size: 12px;
     transition: color 0.2s ease;
     position: relative;
 }
 
 .description-button:hover {
     color: #24292e;
 }
 
 .description-label {
     font-size: 12px;
     white-space: nowrap;
 }
 
 .description-icon {
     display: inline-flex;
     align-items: center;
     justify-content: center;
     width: 18px;
     height: 18px;
     border-radius: 50%;
     background-color: #e1e4e8;
     color: #586069;
     font-weight: 600;
     line-height: 1;
     transition: background-color 0.2s ease, color 0.2s ease;
 }
 
 .description-button:hover .description-icon {
     background-color: #d1d5da;
     color: #24292e;
 }
 
 .description-tooltip {
     position: absolute;
     bottom: calc(100% + 8px);
     left: 50%;
     transform: translateX(-50%);
     background: #f6f8fa;
     color: #24292e;
     padding: 8px 12px;
     border-radius: 6px;
     font-size: 12px;
     line-height: 1.5;
     white-space: normal;
     max-width: 300px;
     min-width: 200px;
     z-index: 1000;
     pointer-events: none;
     opacity: 0;
     visibility: hidden;
     transition: opacity 0.2s ease, visibility 0.2s ease;
     box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
     word-wrap: break-word;
     border: 1px solid #e1e4e8;
 }
 
 .description-tooltip::after {
     content: "";
     position: absolute;
     top: 100%;
     left: 50%;
     transform: translateX(-50%);
     border: 5px solid transparent;
     border-top-color: #f6f8fa;
 }
 
 .description-tooltip::before {
     content: "";
     position: absolute;
     top: 100%;
     left: 50%;
     transform: translateX(-50%);
     border: 6px solid transparent;
     border-top-color: #e1e4e8;
     margin-top: -1px;
 }
 
 .description-button:hover .description-tooltip {
     opacity: 1;
     visibility: visible;
 }
 
 .description-tooltip-text {
     display: block;
 }
 
 .description-tooltip-text p {
     margin: 4px 0;
 }
 
 .description-tooltip-text p:first-child {
     margin-top: 0;
 }
 
 .description-tooltip-text p:last-child {
     margin-bottom: 0;
 }
 
 .description-tooltip-text ul,
 .description-tooltip-text ol {
     margin: 4px 0;
     padding-left: 18px;
 }
 
 .description-tooltip-text li {
     margin: 2px 0;
 }
 
 @media (max-width: 768px) {
    .contribution-graph-container {
        padding: 15px;
    }
    
     .contribution-graph-heatmap-wrapper {
         width: 100%;
         min-width: calc(30px + 53 * 15px);
     }
     
     .month-label, .week-label {
         font-size: 10px;
     }
     
     .contribution-graph-footer {
         flex-direction: column;
         align-items: flex-start;
         gap: 10px;
     }
     
     .contribution-graph-legend {
         width: 100%;
         justify-content: flex-start;
     }
}
</style>';
    }
    
    /**
     * 获取JavaScript脚本
     * 
     * @access private
     * @return string JavaScript代码
     */
    private static function getScripts()
    {
        return '<script>
 (function() {
     function initContributionGraph() {
         const containers = document.querySelectorAll(".contribution-graph-container");
         
         containers.forEach(function(container) {
             if (container.dataset.initialized) return;
             container.dataset.initialized = "true";
             
             const days = container.querySelectorAll(".contribution-day:not(.empty)");
             
             days.forEach(function(day) {
                 day.addEventListener("mouseenter", function(e) {
                     const date = this.dataset.date;
                     const count = parseInt(this.dataset.count) || 0;
                     
                     // 移除之前的提示框
                     const existingTooltip = container.querySelector(".contribution-day-tooltip");
                     if (existingTooltip) {
                         existingTooltip.remove();
                     }
                     
                     const tooltip = document.createElement("div");
                     tooltip.className = "contribution-day-tooltip";
                     tooltip.textContent = date + ": " + count + " 次贡献";
                     
                     // 将提示框添加到容器中，确保不被遮挡
                     container.appendChild(tooltip);
                     
                     // 计算位置：使用fixed定位相对于视口
                     const dayRect = this.getBoundingClientRect();
                     
                     // 设置提示框位置（在方块上方居中）
                     // 使用fixed定位，确保在容器外也能正常显示
                     tooltip.style.left = (dayRect.left + dayRect.width / 2 - tooltip.offsetWidth / 2) + "px";
                     tooltip.style.top = (dayRect.top - tooltip.offsetHeight - 8) + "px";
                     
                     this._tooltip = tooltip;
                 });
                 
                 day.addEventListener("mouseleave", function() {
                     const tooltip = container.querySelector(".contribution-day-tooltip");
                     if (tooltip) {
                         tooltip.remove();
                     }
                     this._tooltip = null;
                 });
             });
             
         });
     }
    
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initContributionGraph);
    } else {
        initContributionGraph();
    }
    
    // 使用MutationObserver监听动态添加的内容
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === "childList") {
                initContributionGraph();
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
</script>';
    }
}
?>

