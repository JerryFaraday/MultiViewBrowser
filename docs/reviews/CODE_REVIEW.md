> 历史归档：保留整理前的开发记录，不代表全部当前行为。来源为提交 939853e；文档归档于2026-11-02。原有日期、测试结论和限制保留，文档链接已按归档位置调整。当前状态参见[已知问题](../KNOWN_ISSUES.md)和[验证记录](../VALIDATION.md)。

# 代码回顾与清理

拖拽方案已替换：由DragOverlay独立原生透明层统一捕获交互，sandbox网页preload不再监听窗口拖放。已删除window-drop.ts及其旧测试，并移除BrowserManager的远程网页drop IPC和onDrop回调。下文旧网页侧方案的描述仅为历史记录，当前实现以独立覆盖层为准。

补充：音频扫描已从单文档扩展为递归可访问同源iframe；media-documents.ts集中处理文档发现与跨域隔离，避免为处理直播间而启用iframe Node权限。新增iframe音频回归和增益前后真实信号测量。

本次检查覆盖 src、electron、scripts、tests。保留现有功能，不以删除测试或跳过检查来完成清理。

- 修复原生网页接收拖放的问题：sandbox preload 拦截应用专用 MIME 类型的可信拖放事件，网页侧不提交源窗口 ID；主进程用工具栏发起的 DragSession 确认来源，验证目标 webContents，完成一次性换位。
- 考虑跨进程 dragend 与 drop 顺序不同，结束后保留 250ms 接收窗口；会话最多有效 60 秒。
- 删除已经由原生浮层替代的 DOM 音量面板、遮罩、刻度布局样式；合并重复 CSS 规则，清除旧覆盖链。
- 移除废弃 pageVolume 模式和未使用的 React/newPage 导入；启用 TypeScript noUnusedLocals/noUnusedParameters，减少后续迭代残留。
- 格式化所有源码和测试，添加 format / format:check，避免持续累积超长行。
- 简化布局有效性检查，避免每个槽位都重复排序；收藏搜索改为每次渲染计算一次。
- 修复收藏分组排序在 React 状态更新函数中读取 SyntheticEvent.currentTarget 的问题：提前保存坐标和插入方向。
- 浏览器销毁时清理所有实例映射和槽位缓存，并防止重复关闭已经销毁的 webContents。
- 配置校验拒绝重复网页 ID，避免多个槽位错误共享一个原生实例。

验证：22 项单元测试；Electron drag-smoke 通过 Chromium Input.dispatchDragEvent 发送可信拖动进入、悬停与放下，确认触发交换一次、实例身份保持、网页仍可见。这是自动化的原生 Chromium 拖放验证，尚不等于所有网站及操作系统鼠标拖动路径均完成手工验收。

仍需后续改进：App.tsx 的配置编辑 UI 较大，可以继续按布局、工作区、收藏栏拆分；跨域/DRM/Web Audio 音量增强与固定视口缩放的已有兼容性限制仍存在。npm 安装报告的 15 项 moderate 依赖公告尚需发布前复核。
