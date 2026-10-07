# Figma 设计归档

本目录保存「AI小说创作app」在 **2026-10-07** 的本地设计快照，供产品评审、界面实现和后续 Agent 恢复上下文使用。

**这份归档不是原生 `.fig` 文件，也不能作为完整 Figma 文件直接导入。** 当前连接器无法导出原生文件，且本次环境没有可用的浏览器导出界面。已保存画板预览、SVG 素材和通过 Plugin API 读取的节点数据；原生文件副本仍待补齐。

## 原始设计

- [Figma 源文件：AI小说创作app](https://www.figma.com/design/vgFbbxZ1MccQHV3wh2ssNj/AI%E5%B0%8F%E8%AF%B4%E5%88%9B%E4%BD%9Capp?node-id=0-1)
- File key：`vgFbbxZ1MccQHV3wh2ssNj`
- 页面：`Page 1`（`0:1`）
- 界面品牌名：**迭页**
- 本次读取未修改 Figma 源设计。

## 文件用途

| 文件 / 目录 | 内容 |
| --- | --- |
| [manifest.json](./manifest.json) | 来源、归档日期、画板与本地文件映射、完整性信息、文件校验值 |
| [source.snapshot.json](./source.snapshot.json) | 627 个节点的层级与可读取属性，包括文字、文字样式片段、布局、颜色、描边、效果、矢量路径及原型交互数据 |
| [screens.json](./screens.json) | 按画板组织的文案与交互信息，便于快速检索 |
| [observed-values.json](./observed-values.json) | 源设计实际使用的字体、字号和纯色填充；尚未形成语义化设计 Token |
| [screens/](./screens/) | 8 张画板的 PNG 预览，按默认导出设置保存 |
| [assets/](./assets/) | 22 个 SVG 导出素材，按来源画板命名；保留跨画板的重复素材便于追溯 |

快照记录了全部页面节点，本次属性读取错误为 0。数据中的 `{"$figmaMixed": true}` 表示该属性在同一节点内有混合值，文字的具体值可查看 `styledTextSegments`。

## 画板索引

源文件的 8 个顶层画板均名为 `AI小说生成应用原型 (Copy)`，本地依据内容命名。尺寸指 Figma 画板尺寸，PNG 可能包含超出画板边界的可见内容。

| 画板 | 节点 ID | 尺寸 | 本地预览 | 源设计 |
| --- | --- | --- | --- | --- |
| 桌面首页 | `1:2` | 1359 × 1373 | [desktop-home.png](./screens/desktop-home.png) | [打开](https://www.figma.com/design/vgFbbxZ1MccQHV3wh2ssNj?node-id=1-2) |
| 桌面阅读器 | `1:160` | 2208 × 1152 | [desktop-reader.png](./screens/desktop-reader.png) | [打开](https://www.figma.com/design/vgFbbxZ1MccQHV3wh2ssNj?node-id=1-160) |
| 桌面世界线结果 | `1:256` | 2208 × 1153 | [desktop-worldline.png](./screens/desktop-worldline.png) | [打开](https://www.figma.com/design/vgFbbxZ1MccQHV3wh2ssNj?node-id=1-256) |
| 手机首页 | `1:389` | 402 × 1135 | [mobile-home.png](./screens/mobile-home.png) | [打开](https://www.figma.com/design/vgFbbxZ1MccQHV3wh2ssNj?node-id=1-389) |
| 手机创建故事 | `1:520` | 402 × 900 | [mobile-create-story.png](./screens/mobile-create-story.png) | [打开](https://www.figma.com/design/vgFbbxZ1MccQHV3wh2ssNj?node-id=1-520) |
| 手机阅读器 | `1:617` | 402 × 1179 | [mobile-reader.png](./screens/mobile-reader.png) | [打开](https://www.figma.com/design/vgFbbxZ1MccQHV3wh2ssNj?node-id=1-617) |
| 手机世界线结果 | `1:708` | 402 × 1136 | [mobile-worldline.png](./screens/mobile-worldline.png) | [打开](https://www.figma.com/design/vgFbbxZ1MccQHV3wh2ssNj?node-id=1-708) |
| 手机导入故事 | `1:906` | 402 × 874 | [mobile-import-story.png](./screens/mobile-import-story.png) | [打开](https://www.figma.com/design/vgFbbxZ1MccQHV3wh2ssNj?node-id=1-906) |

## 与产品文档的对应

[PROTOTYPE.md](../../PROTOTYPE.md) 定义的是 7 个关键交互状态；此处的 8 张画板是部分状态的桌面 / 手机版本，两者不能直接按数量判断完成度。

已覆盖：首页、导入故事、从零创建、正常阅读、改写后的世界线结果。桌面结果页展示原作与世界线对照，手机结果页集中展示改变后的正文。

尚需补齐：

1. 选中文字的状态与「改写这一幕」操作浮层。
2. 阅读器内的改写 Bottom Sheet，包括意图输入、快捷建议、三档改动程度和「改变命运」按钮。
3. 「干预接下来的剧情」、再改一次和继续阅读的交互衔接。
4. 可点击原型连线与起点；本次检测到的 `reactions` 和 `flowStartingPoints` 均为空。

因此，当前文件可以作为视觉设计参考，核心验证路径仍未完成可点击联通。

## 视觉与文案观察

设计以纸色背景（常见值 `#F6F3EC`）、深色文字（`#201E1B`）和紫色强调（`#5F51A6`）呈现沉浸阅读与命运分叉。中文主要使用 **Noto Serif SC**，英文和辅助文字使用 **Outfit**。快照中的字体名称不代表运行环境已安装这些字体。

导入页还出现了 TXT / DOCX 上传、10MB 限制及「不会被公开或用于训练」等文案。这些是设计中的界面表达，仓库尚无对应实现；数据使用承诺需要在实现相关处理方式后核实。

## 归档边界与后续更新

本地快照不包含评论、文件版本历史、分享权限、字体文件和外部库，也不代替 Figma 源文件。当前源设计未发现 IMAGE 填充、已命名的本地样式或本地变量。

后续如需要原生备份，可在 Figma 文件菜单使用 **Save local copy / 保存本地副本**，将导出的文件命名为 `ai-novel-yinanping.fig` 放在本目录，并同步更新 `manifest.json` 的 `nativeFigIncluded` 字段及文件校验信息。

设计发生变化后，应重新导出预览和节点快照，并更新归档日期；此目录不会自动与在线文件同步。
