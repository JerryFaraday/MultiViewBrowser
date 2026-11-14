# 主窗口放大/恢复延迟：暂停检查点

后续状态：同日已恢复测试并完成V0.2.1.5交付，见[最终报告](BILIBILI_COLLECTION_LAYOUT_2026-11-14.md)。以下保留暂停时的历史状态与原始计划。

2026-11-14：用户要求完成当前验证后暂停，关机休息后继续。

**修复尚未交付，正式版本仍为V0.2.1.4。未递增版本、打包或覆盖原启动程序。候选代码保存在本地工作区，尚未作为正式修复提交。**

## 观测与定位

原生尺寸及模拟视口指令通常在切换后约1–12ms内发出，未找到用于主窗口切换的1000ms延时。API返回不等于重绘完成。延迟主要发生在Chromium网页排版阶段；尚未通过历史版本对照证明是哪次提交引入的回归。

四个真实视频各测试10次交替切换，默认四宫格、普通1920×1080/放大2560×1440逻辑视口、Page Zoom 100%。下表是播放器尺寸变化的采样时间，含采样/调度开销，不是最终画面完成时间。

| 页面 | 描述 | 尺寸响应 |
| --- | --- | --- |
| [BV1m7WB6mEuM](https://www.bilibili.com/video/BV1m7WB6mEuM) | 961条大合集 | 435–506ms |
| [BV1pKWq6TEu8](https://www.bilibili.com/video/BV1pKWq6TEu8) | 较小合集 | 42–111ms |
| [BV18zxy6yExZ](https://www.bilibili.com/video/BV18zxy6yExZ) | 另一可复现合集 | 79–165ms |
| [BV1zVWq6aEjS](https://www.bilibili.com/video/BV1zVWq6aEjS) | 普通视频 | 24–32ms |

独立性能轮次中，10次切换累计LayoutDuration依次约3.30、0.224、0.537、0.098秒，不与上表逐次配对。视频持续播放。

在隔离实验中移除右侧合集和播放器选集条目后，大合集响应降至36–56ms，累计LayoutDuration约0.162秒，支持列表排版是主要开销来源。删除实验不会进入产品代码。

## 暂停前最后一组对照

相同工具、同一大合集，分别20次交替切换（10轮完整放大/恢复）；两次均静音，不抓帧。基线在测试实例中移除候选兼容样式，候选保留。未删除条目。

| 指标 | 基线 | 候选 |
| --- | --- | --- |
| 尺寸响应范围 | 448–557ms | 54–146ms |
| 平均响应 | 488ms | 97ms |
| 累计LayoutDuration | 6.330秒 | 0.943秒 |
| 累计TaskDuration | 10.520秒 | 3.654秒 |
| 右侧合集条目 | 961 | 961 |
| 播放器选集菜单条目 | 969 | 969 |
| 网页实例/JS标记保留 | 是 | 是 |
| 主框架导航 | 0 | 0 |
| 开始/结束均播放且播放时间前进 | 是 | 是 |
| 浏览器静音 | 是 | 是 |

候选放大方向54–146ms、恢复96–114ms。本组没有测得最终画面重绘完成时间；`integrityPass`仅验证实例、导航、播放和静音，不能解释为延迟修复全面通过。

## 候选与未采用方案

候选仅对`www.bilibili.com/video/`顶层页面安装兼容样式，对两处列表使用`content-visibility:auto`，延后屏外条目排版。`contain-intrinsic-block-size:auto 31px/30px`是屏外占位，不强制实际行高。已观测大合集961个右侧条目行高均为31px。

不删除条目或事件处理器，不改WebContentsView、逻辑视口、Page Zoom、音频、交换或焦点，不加等待、不隐藏整个网页。但它会更改目标网站列表CSS排版策略，必须继续核对滚动高度、展开多P、远端条目及点击选集；网站未来更改DOM或行高也是兼容风险。

本地未提交文件：`electron/bilibili-layout.ts`、`electron/media-preload.ts`、`electron/resize-transition-smoke.ts`、`scripts/resize-transition-smoke.mjs`。前两者为候选，后两者为诊断工具。

`electron/BrowserManager.ts`已恢复原实现。以下实验未进入候选：关闭再启用设备模拟（严格对照反而变慢）、缓存重复模拟参数、调整调用顺序、统一原生缩放、普通layout containment。避免音频扫描比较播放器自身的试验未降低延迟，也已撤回。测试工具已去掉删除条目的实验代码。

## 保存位置与运行状态

以下根目录结果被Git忽略，已写入本地磁盘；只记录数值/布尔信息及阶段标识，不记录URL、标题、凭据或用户输入。

- `resize-delivery-first-diagnostic.json`：最后20次候选及指标。
- `resize-delivery-first-baseline-diagnostic.json`：最后20次基线及指标。
- `video-resize-first-diagnostic.json`、`video-resize-second-diagnostic.json`、`video-resize-medium-diagnostic.json`、`video-resize-plain-diagnostic.json`：四页早期基线。
- `resize-profile-first-diagnostic.json`、`resize-profile-medium-diagnostic.json`、`resize-profile-plain-diagnostic.json`、`resize-profile-second-diagnostic.json`：中间性能对照。
- 其他诊断文件为中间实验，不能混为正式候选结果。

`dist-electron`含候选测试构建；`release/win-unpacked`未更新。测试使用临时userData，没有覆盖用户配置。用户要求以后测试静音，工具已默认`masterMuted=true`。当前验证进程已经退出，不再启动新测试。

## 早上继续

1. 读取本文及Git状态，保留本地候选；正式程序尚未更新。
2. 验证候选列表滚动高度、首尾条目、展开多P、远端滚动和实际选集点击是否保持一致。
3. 对另外三个视频测试候选，覆盖其他分屏、1080p/1440p/4K逻辑分辨率及Page Zoom，全程静音。
4. 分开验证合成帧/实际画面，注明抓帧开销，不把尺寸采样或API返回当作重绘完成。
5. 最终候选的类型、单测、构建及交换/缩放/拖拽回归尚未完成，不声称已通过。
6. 确认修复完成后才按revision递增一次，预期V0.2.1.5；更新正式记录、扫描提交、普通push及交付。本次暂停不触发递增。

测试入口：`node scripts/resize-transition-smoke.mjs`，依赖已有dist与最新preload构建。`MVB_RESIZE_URL`指定地址，`MVB_RESIZE_CASE`指定仅含小写字母/数字/连字符的结果标签，`MVB_DISABLE_COMPAT=1`仅在诊断实例中移除兼容样式。另有`MVB_LOGICAL_WIDTH`、`MVB_PAGE_ZOOM`、`MVB_LAYOUT_INDEX`；默认使用本地视频夹具。`MVB_CAPTURE=1`记录合成帧，不与不抓帧的时序直接严格对照。以上均为测试参数，不是用户设置。
