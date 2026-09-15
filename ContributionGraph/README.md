# ContributionGraph

类似 GitHub 个人页的贡献热力图。启用后会统计文章发布/修改、页面发布/修改、评论，并按天显示。

## 安装

将本目录放到 `usr/plugins/ContributionGraph/`，后台启用。首次启用会创建表 `typecho_contributions`，并尝试从已有内容回填历史。

## 短代码

```
[ContributionGraph]
[ContributionGraph year="2026"]
[ContributionGraph layout="year"]
[ContributionGraph layout="centered"]
[ContributionGraph year="2026" layout="centered"]
```

| 属性 | 说明 |
|------|------|
| `year` | 四位年份。省略则用插件设置里的默认年份 |
| `layout` | `year`：该年 1–12 月完整日历；`centered`：约 53 周，今天所在周居中 |

Daydream 下也可在写文章 → **组件插入** → **贡献图** 里选布局和年份再插入。

## 插件设置

后台 → 插件 → ContributionGraph：

- 是否追踪：文章发布、文章修改、页面发布/修改、评论
- 默认年份
- 默认布局（`year` / `centered`）

悬停方块可看日期与次数；问号按钮有简短说明。样式按 GitHub 绿档（无贡献 / 1–3 / 4–9 / 10+）。
