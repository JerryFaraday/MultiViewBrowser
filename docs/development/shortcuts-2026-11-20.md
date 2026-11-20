# V0.2.7.0 浏览器快捷键

原因：应用移除了Electron菜单，默认菜单accelerator不再提供刷新/查找等行为；main与BrowserManager此前重复维护缩放、F11和Esc。新增src/core/Shortcuts.ts单一映射，main只路由外壳事件，BrowserManager处理获得焦点的原生网页。外壳通过App的现有选中槽位与visibleSelection转交唯一页面ID，主进程再次验证可见性/设置状态。没有广播网页操作。

新增F5/Ctrl+R、Ctrl+Shift+R/Ctrl+F5、Alt左右、Ctrl+L/Alt+D、Ctrl+F、Ctrl+G/Ctrl+Shift+G。已有Ctrl缩放、Ctrl滚轮、F11保留。未映射的剪贴板、文本撤销、普通网页按键和组合输入不拦截。设置阻止底层网页操作，编辑弹窗的Esc优先关闭编辑器。全屏HTML页面保留Chromium原Esc处理。

FindBar按页面ID绑定webContents.findInPage/stopFindInPage，过滤过期requestId，保存每页查询词于内存，不持久化或记录日志。单个懒创建的本地原生浮窗避开WebContentsView遮挡，宽高根据目标边界及UI比例约束；交换/布局通过bounds更新位置，目标隐藏、关闭、导航或进入设置时关闭。find-preload和find.html使用受限IPC并列入正式打包allowlist，未引入依赖。

实现文件：Shortcuts.ts、FindBar.ts、find-preload.ts、find.html、main.ts、BrowserManager.ts、preload.ts、App.tsx、api.ts及构建/打包配置。单元覆盖映射、IME、编辑及未决定组合键；完整Electron夹具验证副页刷新只改变副页、地址全选、2个匹配、Esc关闭、外壳选中页刷新、设置保护、交换后目标正确。独立缩放/单反馈/Canvas/iframe现有原生专项通过。298项单测、类型/生产构建与格式检查通过，不代表所有网站拦截器和真实多显示器DPI全部验收。查找采用已有主题变量、36px控件与语义标签，不改变网页布局。

待用户决定（未实现）：Ctrl+T是填入首个空槽还是新开工作区？槽满是否暂存？Ctrl+W是否只清空槽位、查找栏焦点时是否先关闭查找？Ctrl+Tab/Shift+Tab按槽位编号、最近使用还是视觉布局轮转，是否包括暂存页？本轮不据此增加槽位或改变关闭语义。


补充原生夹具：强制刷新API调用、实际历史前进/后退、交换后查找栏位置均通过。输入框原生selectAll命令通过；合成Ctrl+A不经过系统菜单accelerator，不能据此声称完整系统键盘编辑链路已验证。单测确认编辑组合键不被新增映射消费，真实IME/所有编辑器仍保留验收范围。
