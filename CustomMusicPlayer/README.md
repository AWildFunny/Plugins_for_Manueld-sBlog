# CustomMusicPlayer

文章内嵌唱片式音乐播放器。支持自托管 MP3、网易云 / QQ（经 Meting）、环形进度、悬浮迷你盘、进页提示。

本目录单独复制到 `usr/plugins/CustomMusicPlayer/` 即可。

## 启用

1. 将本目录放到 `usr/plugins/CustomMusicPlayer/`
2. 后台 → 插件 → 启用 **CustomMusicPlayer**
3. （可选）在插件设置中配置 **Meting API**、**播放器备注文案**

无需修改主题即可使用。插件 CSS 会自行处理导航叠层；若主题使用刘海屏安全区，建议 viewport 含 `viewport-fit=cover`（非必须）。

## 短代码

### 自定义音频

```
[music title="曲名" artist="艺术家" src="https://.../a.mp3" cover="https://.../cover.jpg" mode="click" notice="1" hint="自定义备注"]
```

| 属性 | 说明 |
|------|------|
| `title` | 曲名（必填） |
| `artist` | 艺术家（可选） |
| `src` / `audio` | MP3 URL（必填） |
| `cover` | 封面图 URL（可选） |
| `mode` | `click` 点击播放（默认） / `scroll` 滚入视口自动播 |
| `notice` | `1` 进页右下角「含背景音频」提示（点击跳转并播放） |
| `hint` | 单条覆盖备注文案；留空 `hint=""` 隐藏；不写则用插件设置默认值 |

兼容旧标签名：`[CustomMusicPlayer ...]`。

### 网易云 / QQ

```
[music from="netease" id="185809" mode="click" notice="1"]
[music from="tencent" id="001xxx" mode="click" notice="1"]
```

也可写 `server="netease"`。播放地址按插件里的 Meting 模板拼接 `type=url`，服务端不再因 song 接口失败整段报错；歌名/封面优先用短代码，缺省时由浏览器补拉。

## 后台插入

使用 **Daydream** 主题时，写文章右侧 **组件插入** 中会出现「音乐播放器」（含可编辑备注文案；留空则短代码不写 `hint`，前台用插件默认）。

非 Daydream / 无统一面板时，仍可用本插件自带入口：右侧「选项」→ **插入音乐播放器**。

## 交互说明

- 点击唱片：播放 / 暂停；环形进度可拖拽 seek
- 同页多曲互斥；暂停时保持当前旋转角度
- 正文播放器滚出视口后，右下角出现迷你盘；点击滚回并聚焦
- `notice="1"`：约 5 秒进度条提示；点击跳到对应播放器并播放；关闭或长按可关掉

## 资源与 Pjax

仅在正文含 `[music` 的单页加载 CSS/JS。若主题使用 jQuery Pjax，插件会在 `pjax:send` / `pjax:complete` 时销毁并重新初始化。

## 版本

当前 **2.3.2**（平台曲目先出播放器，再由浏览器补拉歌名/封面）。
