# MultiView Browser 代码健康审计

审计日期：2026-11-12（Asia/Shanghai）。基线：44ca9515cbdead3dcd8967a5621bedee7ad67e9f，V0.1.1.11。本轮仅新增两份文档，不改业务代码、配置或版本。

## 范围与结论

覆盖src、electron的运行代码，抽查scripts、tests及构建配置；依赖风险检查使用现有npm audit命令；重点逐读应用状态、BrowserManager、存储、媒体预加载、布局/音频/缩放、收藏、浮窗、拖动覆盖层、IPC及日志。结合现有测试、历史问题与本轮探针。未做全依赖源码审查、渗透测试、长时性能采样或真实站点全面验收。

共14项：**Critical 0、High 2、Medium 9、Low 3**。已确认表示代码可直接推出或探针复现；潜在风险表示实际后果仍待运行验证；优化建议表示需测量收益。Critical 0不构成安全保证。

架构已有合理分层：纯核心函数与原生视图管理分离，网页沙箱/上下文隔离且禁用Node，主IPC验证sender及主frame，配置通过Zod与布局槽位校验，导航只允许HTTP/HTTPS，权限默认拒绝。视图关闭会清理资源映射；React订阅及观察器有清理路径。未发现足以确认普遍内存泄漏、线程竞态或远程代码执行的证据；状态竞争主要来自跨进程异步消息顺序，而非共享内存线程操作。

操作日志统一白名单过滤，未发现OperationLogger直接记录URL、标题、输入文字或原始错误。媒体audio-status包含原始错误，但生产主进程未发现其落盘接收器，因此不能据此宣称操作日志泄露。

## 发现

以下为基线一基行号；修复方案均是建议，本轮未实施。

### A01 · High · 已确认：旧配置覆盖新状态

位置：src/App.tsx:89–96；electron/main.ts:128–168、205–212、313–325。

原因：UI防抖180ms整份保存；浮窗、缩放、换位也在主进程整份保存再异步通知UI；config-save不校验修订号，exchange-pages接受UI完整配置。影响：后提交的旧快照可能撤销音量、缩放、换位或关闭结果。代码确认冲突机制，历史KI-01有动态复现；本轮原生复现受ACL阻断。

建议：主进程作为唯一权威状态源，采用页面ID细粒度命令和递增revision，拒绝过期写入；补充交错IPC测试。

### A02 · High · 已确认且本轮复现：播放器来源无法交接

位置：electron/media-preload.ts:75–85、97–113、205–225。

原因：仅旧来源脱离DOM或新媒体得分更高才更换volumeSource；旧视频暂停但仍连接DOM时，同面积新播放器不能接管。影响：音量写入旧播放器，新播放器不接受控制也不反向同步。本轮VM探针得到旧媒体0.25、新媒体仍0.75、newPlayerChangeReported=false。

建议：来源选择考虑暂停/结束/可见性及播放事件，同分时优先当前播放媒体；测试替换、恢复播放、多播放器。模拟探针不等同真实直播验收。

### A03 · Medium · 已确认：网站音量同步解除静音

位置：electron/BrowserManager.ts:185–201；electron/main.ts:128–144。

原因：site-volume和用户浮窗共用更新函数，value>0便设置audio=unmuted。影响：网站程序化音量变化可解除用户静音或副窗口自动静音，意外出声。

建议：区分网站同步和用户解除静音；网站同步只改变数值。测试静音后的程序化volumechange。

### A04 · Medium · 潜在资源/性能风险：隐藏页面持续常驻

位置：electron/BrowserManager.ts:88–126、328–332；src/core/model.ts:56–59。

原因：切小布局仅隐藏实例，backgroundThrottling=false；配置允许24页而界面最多9槽。影响：隐藏页面可能继续播放、出声并占CPU/GPU/内存；导入的第10–24页无直接槽位关闭入口。未测实际负载，不称为泄漏。

建议：明确隐藏页面策略，提供页面清单与关闭入口，限制不可达槽位；测量多路直播/最小化负载后决定节流方案。

### A05 · Medium · 潜在可靠性风险：退出未等待最终保存

位置：src/App.tsx:89–96、138–144；electron/main.ts:405–430。

原因：180ms防抖及beforeunload异步invoke无最终确认，close没有等待保存。影响：最后一次编辑可能未落盘，本轮未确定复现丢失。

建议：关闭时请求最终快照并等待保存确认，定义失败反馈与超时；测试编辑后立即关闭和磁盘失败。

### A06 · Medium · 已确认：导入集合引用不完整

位置：src/core/model.ts:66–105；electron/storage.ts:13–23；src/components/FavoritesList.tsx:85–135。

原因：未要求favorite.group存在于groups，未保证分组名、收藏/布局/工作区ID唯一。影响：合法配置可使收藏无法显示，重复React key及按ID操作产生歧义；静态确认，未操作系统导入对话框。

建议：校验或归一化引用及唯一性，返回具体字段错误，增加孤立分组、重复ID测试。

### A07 · Medium · 已确认：收藏拖放路径不一致

位置：src/App.tsx:310–327；src/components/FavoritesList.tsx:134–143；electron/drag-preload.ts:28–36。

原因：收藏drop只由React处理，已加载网页为覆盖DOM的原生视图；覆盖层仅接受窗口换位类型。影响：标题栏/空槽可由应用处理，网页内容内部不能保证打开到目标槽，可能由网站处理。完整系统OLE路径待验证。

建议：为收藏建立受信任原生覆盖层，区分收藏复制与窗口交换，分别验收网页/留白/标题栏。

### A08 · Medium · 已确认：音量浮窗缺少屏幕边界保护

位置：electron/VolumePopup.ts:128–135。

原因：固定在按钮下方显示160px，没有ScalePopup的工作区夹取。影响：靠近屏幕底部或副屏边缘可能部分不可达；静态确认，未做多屏运行验证。

建议：按最近显示器workArea选择向上/下展开并夹取位置，覆盖负坐标及高DPI。

### A09 · Medium · 潜在稳定性风险：网页进程退出无恢复状态

位置：electron/BrowserManager.ts:126–307；electron/main.ts:424–427。

原因：外壳有render-process-gone日志，远程视图无对应状态反馈和恢复策略；loadURL拒绝多被吞掉。影响：网页进程退出后可能留下不可用视图且缺少明确恢复提示；未做崩溃注入。

建议：按页面ID发布退出状态，提供重载/重建及有限重试；日志只用脱敏类别。

### A10 · Medium · 优化建议：DOM变化反复全量扫描媒体

位置：electron/media-preload.ts:203、241–253；electron/media-documents.ts:2–17。

原因：各同源文档MutationObserver均触发scan，重新扫描所有可访问iframe及媒体，并可能读取布局尺寸。影响：弹幕等高频DOM变化可能增加CPU/布局计算，多视图叠加；未做profile，不断言已有卡顿。

建议：合并同帧扫描、增量处理节点、减少无关扫描；测量长时CPU、帧时间及媒体节点释放。

### A11 · Medium · 已确认：小布局未收敛选中槽位

位置：src/App.tsx:25、186–203、214–221、594–606。

原因：apply更新布局但不重设selected，收藏默认打开到selected而不校验可见slots。影响：选第9槽后切单窗口，再点击收藏可导航隐藏第9槽；选择框当前值也可能不在选项中。

建议：布局/工作区/导入后将selected映射到可见槽位，打开前再校验；回归大布局→小布局→打开收藏。

### A12 · Low · 优化建议：入口职责过宽

位置：src/App.tsx:20（App函数）；electron/main.ts:36（启动回调及IPC注册）。

原因：App集中状态、保存、布局、收藏、拖放、对话框；main集中多个IPC域和存储事务。影响：时序与跨功能副作用难审查，文件长度本身不构成缺陷。

建议：先统一权威状态，再围绕session命令、持久化协调、收藏与对话框划分职责，保留纯核心层。

### A13 · Low · 优化建议：同步I/O与重复边界更新

位置：electron/storage.ts:31–49；electron/OperationLogger.ts:65–85；src/App.tsx:125–136；electron/BrowserManager.ts:328（bounds方法）。

原因：同步读/校验/备份/写配置，操作事件同步writeSync；config变化重建ResizeObserver并重复发送bounds，后者重复应用设备模拟。影响：大收藏/慢盘可能阻塞主进程，无实测时长。

建议：先测量，再引入有序缓存写队列、边界比较及帧合并，保持退出flush和写入顺序。

### A14 · Low · 已确认：快捷键解析重复且不一致

位置：electron/main.ts:75–98；electron/BrowserManager.ts:203–230。

原因：两处Ctrl缩放解析重复，网页路径额外识别数字键盘code，外壳仅按key判断。影响：维护易漂移，数字键盘行为可能随焦点/键盘布局变化；本轮未人工验证。

建议：提取纯解析函数，明确修饰键，并测试网页与外壳焦点。类型检查已启用noUnusedLocals/noUnusedParameters且通过，未发现需单列的未使用变量诊断；不代表不存在语义冗余。

## 本轮验证记录

未安装新依赖。直接调用已有CLI执行build脚本对应阶段。以下为本轮结果，不以旧结果文件冒充新验证。

| 检查               | 命令/方法                                                                                                                | 结果                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 单元测试           | node node_modules/vitest/vitest.mjs run                                                                                  | 13文件、34测试通过                                                        |
| 严格类型检查       | node node_modules/typescript/bin/tsc --noEmit                                                                            | 通过，无诊断                                                              |
| 生产构建           | node node_modules/vite/bin/vite.js build；node scripts/build.mjs                                                         | 均通过，未递增版本，未重新打包安装器                                      |
| 格式检查           | node node_modules/prettier/bin/prettier.cjs --check src electron scripts tests package.json tsconfig.json vite.config.ts | 通过；项目无ESLint配置，未新增工具                                        |
| 媒体来源探针       | node scripts/review-media-probe.mjs                                                                                      | 正常退出，defectReproduced=true；VM模拟复现A02                            |
| 原生审计/交换/缩放 | node scripts/review-probe.mjs；node scripts/exchange-smoke.mjs；node scripts/page-zoom-smoke.mjs                         | 均被Electron运行时目录ACL阻断并FATAL退出，未完成交互验收                  |
| 依赖公告           | node .npm-tools/bin/npm-cli.js audit --json                                                                              | 失败：registry审计端点请求失败，另有npm-cache日志写入受限；当前漏洞数未知 |

Electron提示运行时目录有AppContainer SID条目但缺少ALL APPLICATION PACKAGES读取权限。本轮未改系统ACL或禁用沙箱；不能把环境启动失败判为应用逻辑崩溃。真实鼠标、完整焦点、IME、多屏DPI、登录聊天、视频全屏及长时直播待环境恢复后验收。旧的moderate公告计数不作为当前结论。

暂存文档后执行git diff --cached --check及node scripts/check-secrets.mjs，实际结果见交付汇报。构建/探针忽略产物不提交。本任务要求不修改现有文档，因此问题集中记录于本报告，不更新KNOWN_ISSUES、README或CHANGELOG。

## 后续建议

先修A01/A02，再处理静音、隐藏槽位选择及导入一致性；补足关闭与崩溃恢复，按真实profile决定性能改动。共享持久化Session是产品边界，各视图并非独立登录身份；配置为明文，不应等同于Cookies导出。测试通过仅证明覆盖场景，不证明没有其他缺陷。

## 严重程度与证据索引

本报告的Critical指可导致严重安全失陷或广泛不可恢复损坏的问题；High指主要功能失效或用户状态被覆盖；Medium指局部正确性、可靠性或有条件的资源风险；Low指维护性或尚无量化收益的局部优化。严重程度是本项目使用场景下的排序，不代表第三方漏洞CVSS评分。

| 类别                         | 项目                                   | 数量 |
| ---------------------------- | -------------------------------------- | ---- |
| 已确认（静态或模拟证据）     | A01、A02、A03、A06、A07、A08、A11、A14 | 8    |
| 潜在风险（后果仍待动态验证） | A04、A05、A09                          | 3    |
| 优化建议（需测量收益）       | A10、A12、A13                          | 3    |

审计覆盖质量、架构、资源、性能、交互和安全六个方面。重复逻辑的明确例子为A14；未使用声明由严格类型检查覆盖；状态和耦合重点见A01/A12；生命周期与异常恢复见A04/A05/A09；CPU/GPU负载与事件效率见A10/A13；布局、拖放、选中状态与浮窗见A07/A08/A11。网页关闭路径有原生视图销毁及映射清理，媒体断开节点有增益断连；这些清理路径不足以证明没有长时泄漏，仍需堆快照、进程内存曲线和真实媒体负载测试。

依赖使用锁文件管理，但在线公告查询失败，本轮不能给出“依赖安全”结论；没有对每个传递依赖逐行审查。建议在可联网环境复跑同一audit命令，依据生产可达性逐项评估，不直接批量升级或使用强制修复。
