# MultiView Browser 代码健康审计

审计日期：2026-11-12（Asia/Shanghai）。基线：44ca9515cbdead3dcd8967a5621bedee7ad67e9f，V0.1.1.11。本轮仅新增两份文档，不改业务代码、配置或版本。

## 范围与结论

覆盖src、electron的运行代码，抽查scripts、tests及构建配置；依赖风险检查使用现有npm audit命令；重点逐读应用状态、BrowserManager、存储、媒体预加载、布局/音频/缩放、收藏、浮窗、拖动覆盖层、IPC及日志。结合现有测试、历史问题与本轮探针。未做全依赖源码审查、渗透测试、长时性能采样或真实站点全面验收。

共15项：**Critical 0、High 2、Medium 10、Low 3**。已确认表示代码可直接推出或探针复现；潜在风险表示实际后果仍待运行验证；优化建议表示需测量收益。Critical 0不构成安全保证。

架构已有合理分层：纯核心函数与原生视图管理分离，网页沙箱/上下文隔离且禁用Node，主IPC验证sender及主frame，配置通过Zod与布局槽位校验，导航只允许HTTP/HTTPS，权限默认拒绝。视图关闭会清理资源映射；React订阅及观察器有清理路径。未发现足以确认普遍内存泄漏、线程竞态或远程代码执行的证据；状态竞争主要来自跨进程异步消息顺序，而非共享内存线程操作。

操作日志统一白名单过滤，未发现OperationLogger直接记录URL、标题、输入文字或原始错误。媒体audio-status包含原始错误，但生产主进程未发现其落盘接收器，因此不能据此宣称操作日志泄露。

## 发现

以下为基线一基行号；修复方案均是建议，本轮未实施。

### A01 · High · 已确认：旧配置覆盖新状态

位置：src/App.tsx:89–96；electron/main.ts:128–168、205–212、313–325。

原因：UI防抖180ms整份保存；浮窗、缩放、换位也在主进程整份保存再异步通知UI；config-save不校验修订号，exchange-pages接受UI完整配置。影响：后提交的旧快照可能撤销音量、缩放、换位或关闭结果。代码确认冲突机制，历史KI-01有动态复现；初次原生复现受ACL阻断；后续在沙箱外重跑已复现100%→25%→100%的旧快照覆盖。

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
| 潜在风险（后果仍待动态验证） | A04、A05、A09、A15                     | 4    |
| 优化建议（需测量收益）       | A10、A12、A13                          | 3    |

审计覆盖质量、架构、资源、性能、交互和安全六个方面。重复逻辑的明确例子为A14；未使用声明由严格类型检查覆盖；状态和耦合重点见A01/A12；生命周期与异常恢复见A04/A05/A09；CPU/GPU负载与事件效率见A10/A13；布局、拖放、选中状态与浮窗见A07/A08/A11。网页关闭路径有原生视图销毁及映射清理，媒体断开节点有增益断连；这些清理路径不足以证明没有长时泄漏，仍需堆快照、进程内存曲线和真实媒体负载测试。

依赖使用锁文件管理，但在线公告查询失败，本轮不能给出“依赖安全”结论；没有对每个传递依赖逐行审查。建议在可联网环境复跑同一audit命令，依据生产可达性逐项评估，不直接批量升级或使用强制修复。

## 补充验证（2026-11-12，基于23dce5d）

以下结果更新前文初次尝试的环境阻断状态，保留初次记录以区分验证批次。改用受控提权在执行环境沙箱外运行现有探针，应用自身Electron沙箱仍开启；没有修改系统ACL、业务源码、项目配置或依赖，也没有递增版本。使用探针自己的临时用户数据目录和本地HTTP测试页面，未操作用户已有会话。所有结果均检查了本次生成时间，而非读取旧结果冒充重跑。

| 验证                                                 | 本次结果及边界                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| review-probe                                         | 原脚本失败：electron/review-probe.ts:55–57匹配旧标题MultiViewBrowser，而当前标题为MultiView Browser，找不到窗口产生TypeError。仅在dist-electron忽略产物中替换标题后直接运行对应cjs；生成有效JSON，复现旧状态覆盖及网站音量解除静音。不是声称原脚本未经调整已通过 |
| exchange-smoke                                       | pass=true；6个场景焦点及同实例检查通过，三网页内部identity和输入内容保留。含主副、副副、主网页移入空副槽及移回主槽                                                                                                                                               |
| page-zoom-smoke                                      | pass=true；18个布尔检查通过，覆盖独立内容缩放、键盘、滚轮请求、上下限、复位、实例保留、交换及缩放反馈生命周期。自动化请求不等同真实硬件滚轮全流程                                                                                                                |
| interaction-smoke                                    | 退出0且pass=true；检查多视图缩放隔离、响应式切换、逻辑视口及页面状态保留，并非所有鼠标/IME验收                                                                                                                                                                   |
| drag-smoke                                           | 退出0且pass=true；覆盖层标题栏/内容区投放、背景媒体继续播放、底层无点击/投放、结束隐藏及实例保留。未完成真实系统OLE鼠标全流程                                                                                                                                    |
| audio-smoke                                          | 退出0且pass=true；页面音量、网站75%回传、放大临时静音/恢复、总静音及信号增益通过，本地音频测得master=0.5时输出/输入RMS比0.5；不推广到全部站点                                                                                                                    |
| popup-smoke                                          | 退出0且pass=true；左键和脚本弹窗当前槽导航、中键填空槽、槽满忽略及源网页保留通过                                                                                                                                                                                 |
| log-smoke                                            | 退出0且pass=true；26条记录包含生命周期/UI/音频/网页事件，测试敏感字符串未出现在日志中。此检查不证明全部隐私场景均无泄露                                                                                                                                          |
| ui-smoke                                             | 退出1且pass=false；具体未满足项为electron/ui-smoke.ts:308附近nativePopup.width===nativePopup.buttonWidth：本次35与34，aligned=true。布局16预设、收藏表单、缩放分辨率与放大还原等已记录字段满足相应断言。几何舍入/DPI原因尚未确定，不修改断言掩盖失败             |
| npm audit --json --cache .cache/npm-audit            | 请求成功、退出1（表示发现公告），6个moderate受影响包条目、high/critical为0；同一minimatch公告沿工具链传播，不是6个独立漏洞                                                                                                                                       |
| npm audit --omit=dev --json --cache .cache/npm-audit | 请求成功、退出0，本次生产依赖查询返回0条；不代表Electron内核或全部供应链均安全                                                                                                                                                                                   |

review探针新证据：staleSave={initial:100,afterPopup:25,afterStaleSave:100}；siteVolumeUnmutes={nativeBefore:true,audioAfter:unmuted,nativeAfter:false}。因此A01/A03现在有本次本地原生动态证据。交换后的焦点规则已获得上述6个受控案例验证，普通用户真实鼠标、多屏高DPI、IME、真实站点登录聊天、视频全屏及长时负载仍需人工/专项验收，不作为本轮全通过项目。

综合界面探针的1px宽度断言失败作为验证遗留项记录：建议检查Windows缩放比例、窗口物理/逻辑坐标转换及实际视觉边界，再决定修正实现还是断言容差。本轮没有足够证据将其认定为新的应用功能缺陷；旧标题匹配则是确认的审计脚本维护问题，建议以后用稳定窗口标识定位。

### A15 · Medium · 潜在安全风险：开发打包依赖命中拒绝服务公告

位置：package.json:36的electron-builder开发依赖；package-lock.json:277和4009分别锁定minimatch 9.0.9与10.2.6；由npm ls minimatch --all确认实际安装链。

本次npm audit返回6个moderate包条目：minimatch、@electron/universal、app-builder-lib、dmg-builder、electron-builder、electron-builder-squirrel-windows。直接公告为[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)，受影响版本>=7.0.0且<11.0.1，修复版本11.0.1。公告描述攻击者可控glob模式在特定优化路径造成资源放大、CPU/内存拒绝服务。依赖命中已确认；本项目是否能由不可信输入触达该路径尚未证明，未做恶意负载复现，故按潜在风险列项。该链来自开发打包工具，未证明远程网页可利用。

建议：限制打包时处理不可信模式/项目输入，在隔离构建环境验证上游兼容修复，再选择依赖更新方案。npm给出的electron-builder 25.1.0方案跨当前版本且涉及降级，不能直接视为安全升级建议；不运行audit fix --force。本轮不变更依赖。新增此项后总数为15，严重程度Critical 0、High 2、Medium 10、Low 3；证据分类为已确认8、潜在风险4、优化建议3。

## 第一阶段修复状态（V0.1.1.12，2026-11-12）

原始审计条目、基线行号及历史复现记录全部保留。A01、A02、A03现标记为**已修复，通过本地回归；真实网站兼容性未全面验收**。其他条目不在本阶段修复范围。15项为累计审计发现数，不是当前未修复数量。

### A01：主进程权威配置与旧快照合并

修改涉及electron/storage.ts、electron/main.ts、electron/preload.ts、src/core/ConfigMerge.ts、src/core/model.ts、src/core/WorkspaceManager.ts、src/api.ts和src/App.tsx。

主进程ConfigStore是配置写入权威，保存成功后增加revision。旧配置没有revision时兼容为0。主进程保留最近128个基线快照，渲染进程提交携带基线revision的草稿：比较基线、草稿和最新配置，独立字段修改合并，同字段冲突保留主进程最新值；已删除页面不被旧编辑复活，网页字段按ID跟随实例合并。双方同时改变数组顺序/结构时保留主进程结构，页面删除优先于旧字段编辑，不宣称能够无损融合所有并发集合结构操作。基线不可用时明确报错，拒绝覆盖。历史仅在当前进程内保存，不做跨启动的旧草稿重放。

渲染进程收到保存响应和主进程事件后重新合并尚未提交的草稿，忽略落后于已确认revision的响应；已确认状态不反复自动保存。主进程在首次加载时初始化原生会话，不再依靠渲染进程回写同一配置触发启动。交换IPC先合并，再按来源/目标页面ID查找最新位置；消失目标不会被错误的旧槽位代替。未改变换位后的焦点及音频规则。退出最终保存握手（A05）不在本次修复范围。

回归：tests/config-race.test.ts覆盖旧快照不撤销音量/换位/缩放/已保存工作区、工作区快照读取恢复、关闭不复活且槽位不前移、并发页面字段跟随换位ID、未知修订号拒绝且状态不变。原生review-probe测得100%→浮窗25%→提交旧快照后仍25%，pass=true。exchange-smoke六场景焦点及同实例保留通过；page-zoom-smoke独立缩放、复位、交换及反馈18项布尔检查通过。

### A02：播放器交接

修改electron/media-preload.ts及tests/media-lifecycle.test.ts。选源允许旧源暂停或结束后由就绪且播放中的新媒体接管；play事件在同分时优先新播放来源，常规扫描保留严格得分比较，避免等大播放器随DOM扫描来回抢占。接管时清除该媒体的已应用缓存，使当前页面音量立即写入；旧媒体volumechange不再作为来源同步。

VM回归验证旧节点仍连接DOM时新源获得25%、反向50%回传、旧源不再污染同步，以及同分播放事件接管。review-media-probe新增失败退出判定，当前newVolume=0.25、newPlayerChangeReported=true、defectReproduced=false。原生review-probe新增本地Chromium真实video克隆替换：保留旧DOM并暂停，新video播放后获得25%，再将新video设为50%后主进程读回50%，replacementPass=true。这是本地媒体验证，不是Bilibili等真实站点验收。

### A03：网站同步与用户意图区分

修改electron/main.ts及src/core/AudioManager.ts。setPageVolume仅在userInitiated且非零音量时解除静音；BrowserManager网站回传明确传false，音量浮窗仍保留用户主动解除静音语义。主副自动策略、总静音及放大时临时静音路径不变。

单元回归覆盖muted/auto/unmuted三种状态的网站回传、自动副槽静音和用户主动调节。原生review-probe显示网站回传75%后audio仍muted且nativeBefore/nativeAfter均true；新播放器50%回传也保持muted。audio-smoke页面音量、总音量增益、放大/恢复静音及总静音检查通过。上述不保证网站自有音频图或跨域媒体均可控。

### 本次验证与遗留边界

未安装依赖；按约定仅执行一次bump-version，版本V0.1.1.12。严格类型检查、生产构建（tsc、Vite、Electron esbuild）、全量39项测试（14文件）、项目格式检查通过。review、媒体、exchange、page-zoom、audio、drag、log探针通过；日志测试敏感字符串未落盘。初次测试遇到执行沙箱临时目录rename权限限制，改用受控提权重跑通过；保留Electron应用沙箱，无系统ACL修改。

综合ui-smoke仍退出1：nativePopup.width=35与buttonWidth=34严格相等断言失败，aligned=true；与补充审计记录的1px几何问题一致，本阶段未修复，也未放宽断言。review-probe同时修正了旧窗口标题定位，并对A01/A03及本地媒体替换加入明确pass与非零失败退出，避免仅输出数据却误报通过。

真实鼠标OLE、多屏DPI、IME、真实网站登录聊天、自有播放器及长时间媒体负载仍未全面验收。工作区回归包含序列化保存/读取恢复的快照字段，未声称覆盖了全部人工CRUD或真实站点状态恢复。
