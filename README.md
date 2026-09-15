# Plugins for Manueld's Blog

给 [Typecho](https://typecho.org) 用的一组文章组件插件，来自 [manueld.me](https://www.manueld.me)。

每个子目录都是一个完整插件，文件夹名与 Typecho 后台显示的名称一致，拷到 `usr/plugins/` 后即可启用。插件之间没有强制依赖，按需安装即可。

演示站点：[www.manueld.me](https://www.manueld.me)  
博客主题与站点源码：[AWildFunny/Manueld.me](https://github.com/AWildFunny/Manueld.me)

## 包含的插件

| 目录 | 版本 | 作用 |
|------|------|------|
| [CustomMusicPlayer](CustomMusicPlayer/) | 2.3.2 | 文章内嵌唱片式播放器（自托管 MP3 / 网易云 / QQ） |
| [AuthorNotice](AuthorNotice/) | 1.0.0 | 作者申明色块 `[notice]` |
| [AlbumShot](AlbumShot/) | 1.8.0 | 图文融合画布（单图版式、多图构图、叠字、再编辑） |
| [ContributionGraph](ContributionGraph/) | 1.2.0 | GitHub 风格贡献热力图 |

更细的短代码与选项见各目录内的 `README.md`。

## 环境

- Typecho 1.2（插件声明 `@dependence 9.9.2-*`）
- PHP 7.4 或 8.x（本站在 8.x 下使用）

短代码在任意主题下都能解析。写文章时的可视化「组件插入」面板来自主题 [Daydream](https://github.com/AWildFunny/Manueld.me/tree/main/usr/themes/Daydream)（`include/ComponentInserter/`），**不是**本仓库里的插件。没有 Daydream 时：

- 仍可手写短代码
- **CustomMusicPlayer** 自带侧栏「插入音乐播放器」入口
- 其余三个插件的后台面板不会出现

## 安装

1. 下载本仓库（`Code` → `Download ZIP`，或 `git clone`）。
2. 把需要的文件夹完整复制到站点的 `usr/plugins/`，例如：

   ```
   usr/plugins/CustomMusicPlayer/
   usr/plugins/AuthorNotice/
   usr/plugins/AlbumShot/
   usr/plugins/ContributionGraph/
   ```

   目录名不要改，也不要只拷 `Plugin.php`（`assets/` 必须一起带上）。
3. 登录 Typecho 后台 → **插件** → 启用对应项。
4. 若从旧版本升级 **AlbumShot**，启用后若短代码不生效，请禁用再启用一次（刷新 Markdown 钩子）。

**ContributionGraph** 启用时会创建数据表 `typecho_contributions`，并尝试回填历史发文/评论。

## 短代码速查

```
[music title="曲名" artist="艺术家" src="https://example.com/a.mp3" cover="https://example.com/cover.jpg"]
[music from="netease" id="185809" mode="click" notice="1"]

[notice title="说明" color="#4E7289" text="#ffffff"]正文，空行分段[/notice]

[album-shot layout="overlay" src="/usr/uploads/a.jpg" alt="现场"]

[ContributionGraph]
[ContributionGraph year="2026" layout="centered"]
```

图文融合的多图请用插件面板插入（输出的是带坐标的 HTML 画布）。不要手写相邻的 `[img][img]`，会被 Markdown 当成引用链接拆掉。

## 和主题的关系

| 能力 | 在哪 |
|------|------|
| 播放器、申明、画布、贡献图的解析与前台样式 | 本仓库各插件 |
| 写文章「组件插入」弹窗 | Daydream 主题 |
| 「音乐相册」章节目录、章头图 | Daydream 的 `post/music-album.php`，不是插件 |

只用播放器或申明，不必安装相册模板。

## 许可

[GPL-2.0](LICENSE)。与 Typecho 相同协议。使用、修改、再分发时请保留版权与许可证声明。

## 问题

站点相关的讨论可以开 [Issue](https://github.com/AWildFunny/Plugins_for_Manueld-sBlog/issues)。请尽量写明 Typecho / PHP 版本、是否使用 Daydream，以及短代码原文。
