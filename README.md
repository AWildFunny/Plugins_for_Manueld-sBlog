# Plugins for Manueld's Blog

用于 [Typecho](https://typecho.org) 博客的文章组件插件，依赖于Daydream[usr/themes/Daydream](https://github.com/AWildFunny/Manueld.me/tree/main/usr/themes/Daydream)主题，来自 [manueld.me](https://www.manueld.me)。

每个子目录都是一个完整插件，文件夹名与 Typecho 后台显示的名称一致，拷贝到 `usr/plugins/` 后即可启用。插件之间没有强制依赖，可按需安装。

演示站点：[www.manueld.me](https://www.manueld.me)  
博客主题与站点源码：[AWildFunny/Manueld.me](https://github.com/AWildFunny/Manueld.me)

## 包含的插件

| 目录 | 版本 | 作用 |
|------|------|------|
| [CustomMusicPlayer](CustomMusicPlayer/) | 2.3.2 | 文章内嵌唱片式播放器（自托管 MP3 / 网易云 / QQ） |
| [AuthorNotice](AuthorNotice/) | 1.0.0 | 作者申明色块 `[notice]` |
| [AlbumShot](AlbumShot/) | 1.8.0 | 图文融合画布（单图版式、多图构图、叠字、再编辑） |
| [ContributionGraph](ContributionGraph/) | 1.2.0 | GitHub 风格贡献热力图 |

## 环境

- Typecho 1.2（插件声明 `@dependence 9.9.2-*`）
- PHP 7.4 或 8.x（本站在 8.x 下使用）

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

## 短代码速查

```
[music title="曲名" artist="艺术家" src="https://example.com/a.mp3" cover="https://example.com/cover.jpg"]
[music from="netease" id="185809" mode="click" notice="1"]

[notice title="说明" color="#4E7289" text="#ffffff"]正文，空行分段[/notice]

[album-shot layout="overlay" src="/usr/uploads/a.jpg" alt="现场"]

[ContributionGraph]
[ContributionGraph year="2026" layout="centered"]
```

## 许可

[GPL-2.0](LICENSE)。与 Typecho 相同协议。使用、修改、再分发时请保留版权与许可证声明。
