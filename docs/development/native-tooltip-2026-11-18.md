# V0.2.6.2 原生提示失焦清理

截图中的“5号窗口：拖动交换网页”为HTML title的Chromium原生Tooltip，并非应用的音量/缩放浮窗。现有SettingsService只管理提示启用/禁用，缺少原生悬停在窗口切换时的清理；Windows切换不保证向原渲染控件发送鼠标离开。此项是代码定位的缺失路径，不宣称已证明所有Windows内部Tooltip故障原因。

新增electron/native-tooltip.ts，由SettingsService为应用BrowserWindow安装：blur/hide/minimize、WebContents失焦及Alt键/Alt+Tab按下时发送mouseLeave，原生悬停目标失效。不消费快捷键、不移动系统鼠标、不删除title，不修改第三方WebContentsView。覆盖本地界面窗口及后续创建的本地浮窗，没有增加定时关闭或轮询。

单元测试验证事件覆盖、快捷键不被吞、窗口销毁安全；隔离Electron原生窗口切换测试确认收到真实mouseout，返回后title保留。这个自动化证据不等同对所有Win11 Alt+Tab/Aero Peek残留原生窗口的像素验收，用户实际切换仍需复核。未改颜色/尺寸/布局，设计规范对应视觉验收不适用；保留现有主题和提示开关。

复跑：node scripts/smoke/native-tooltip-smoke.mjs。测试只使用静态无账号页面。
