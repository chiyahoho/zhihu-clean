# 知乎推荐页净化

[![CI](https://github.com/chiyahoho/zhihu-clean/actions/workflows/ci.yml/badge.svg)](https://github.com/chiyahoho/zhihu-clean/actions/workflows/ci.yml)

一个轻量、无额外权限、无遥测的 Chrome Manifest V3 扩展，用于精简知乎首页推荐流与导航/侧栏入口。

> [!IMPORTANT]
> 本项目是非官方第三方扩展，与知乎无隶属、合作或背书关系。知乎页面结构可能随时变化；如果规则失效，请按[问题反馈](#问题反馈)提供必要信息。

## 功能

- 隐藏明确标记为“广告”或“推广”的推荐卡片。
- 留白与 AI、金融、经济、投资无关的低赞回答。
- 留白与上述主题无关、没有“关注的人赞同/推荐”迹象的高赞文章。
- 隐藏“热榜、专栏、圈子、AI Works、故事、直答”导航入口。
- 隐藏右侧“大家都在搜”和“盐言作者平台”模块。
- 支持知乎单页应用的动态加载与站内跳转。

## 过滤规则

| 对象 | 处理条件 | 处理方式 |
| --- | --- | --- |
| 广告卡片 | 有广告 DOM 特征，或叶子标签精确显示“广告 / 推广” | 原地留白 |
| 文章 | 赞同数不少于 1,000、主题无关，且没有关注者背书迹象 | 原地留白 |
| 回答 | 赞同数少于 10,000，且主题无关 | 原地留白 |
| 顶部导航 | 热榜、专栏、圈子、AI Works、故事、直答 | 直接移除 |
| 右侧模块 | 大家都在搜、盐言作者平台 | 整块或整行移除 |

推荐卡片只在 `https://www.zhihu.com/` 首页处理；导航和侧栏入口在 `https://www.zhihu.com/*` 范围内处理。卡片“留白”使用 `visibility: hidden`，因此会保留原来的高度和位置，后续内容不会补位。

## 安装

1. 下载或克隆本仓库。
2. 在 Chrome 地址栏打开 `chrome://extensions/`。
3. 打开右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择包含 `manifest.json` 的项目根目录。
6. 刷新已经打开的知乎页面。

代码更新后，需要先在 `chrome://extensions/` 中点击扩展的“重新加载”，再刷新知乎页面。

## 隐私与权限

- `manifest.json` 没有声明 `permissions` 或 `host_permissions`。
- 内容脚本只匹配 `https://www.zhihu.com/*`。
- 扩展不会主动发起网络请求，不包含统计、遥测或远程代码。
- 扩展仅检查当前页面已经渲染的 DOM，用于识别卡片、赞同数、推荐来源和入口文本。
- 所有判断均在浏览器本地完成。

你可以直接查看 [manifest.json](manifest.json)、[rules.js](rules.js) 和 [content.js](content.js) 核对上述行为。

## 自定义规则

阈值、主题关键词和入口匹配规则位于 [rules.js](rules.js)：

- `ARTICLE_VOTE_THRESHOLD`：文章阈值，默认 `1,000`。
- `ANSWER_VOTE_THRESHOLD`：回答阈值，默认 `10,000`。
- `CHINESE_TOPIC_KEYWORDS`：中文主题关键词。
- `ENGLISH_TOPIC_PATTERN`：英文主题正则。
- `BLOCKED_ENTRY_ALIASES`：需要隐藏的入口文案。

修改后运行测试，并重新加载扩展。

## 开发

要求：Node.js 20 或更高版本。项目没有 npm 运行时依赖。

```bash
npm test          # 运行规则单元测试
npm run check     # 语法检查 + 单元测试
```

主要文件：

```text
manifest.json       扩展清单与加载范围
rules.js            可测试的纯规则与阈值
content.js          DOM 扫描、动态监听与隐藏逻辑
content.css         留白及隐藏样式
test/rules.test.js  Node.js 单元测试
```

## 调试

被处理的元素会带上便于排查的属性：

- `data-zhihu-clean-reason`：推荐卡片的过滤原因。
- `data-zhihu-clean-entry`：被隐藏的导航或侧栏入口。

常见排查步骤：

1. 确认扩展已在 `chrome://extensions/` 中重新加载。
2. 对知乎页面执行强制刷新。
3. 在开发者工具 Elements 面板搜索 `zhihu-clean`。
4. 若仍未生效，提交问题时附上页面 URL、入口名称、Chrome/扩展版本和脱敏后的 DOM 片段。

## 已知限制

- 知乎会不定期调整类名和 DOM 结构，入口或卡片识别可能暂时失效。
- “关注的人赞同/推荐”只能依据推荐卡片当前显示的来源文案判断。
- 赞同数尚未渲染或无法解析时，不会仅凭阈值过滤卡片。
- 主题相关性采用关键词判断，不是语义模型，可能存在漏判或误判。
- 当前主要面向桌面版 Chrome；其他 Chromium 浏览器可能可用，但未作为正式兼容目标验证。

## 问题反馈

- Bug：使用 [Bug Report](https://github.com/chiyahoho/zhihu-clean/issues/new?template=bug_report.yml) 模板，并提供可复现信息。
- 功能建议：使用 [Feature Request](https://github.com/chiyahoho/zhihu-clean/issues/new?template=feature_request.yml) 模板说明使用场景和预期行为。
- 安全问题：不要创建公开 Issue，请按 [SECURITY.md](SECURITY.md) 私下报告。

参与修改前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。版本变化记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
