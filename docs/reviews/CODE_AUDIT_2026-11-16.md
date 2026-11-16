# 代码健康审计：2026-11-16

## 基线、范围与结论

- 基线：`6aee48722ec01d6a5496c74f1bfd4a99e0ddf193`，V0.2.6.0，审计开始时工作区干净。
- 本轮只新增/更新审计与验证文档，不修复业务代码、不安装依赖、不递增版本。
- 覆盖React状态与布局、配置合并/持久化/关闭握手、原生视图及全屏、媒体控制/暂停/释放、暂存、设置/权限、直播轮询/原生辅助进程、操作日志及构建/测试。重点逐读新资源策略和配置路径；UI规范已阅读，仅静态审查，不是完整视觉验收。
- 新一轮结论共**9项：Critical 0、High 2、Medium 6、Low 1**。已确认6项（N01/02/03/04/06/07）、潜在风险2项（N05/08）、维护建议1项（N09）。严重程度按用户状态丢失、功能错误和影响范围排序；第三方公告的moderate不直接等于本报告High。
- 上次A01–A03的修复不应整体撤销：本次原生review和换位检查仍验证了旧音量快照不回退、网站回传不解除静音。**A01的字段合并已改善，但集合结构并发仍有N01；不是“状态竞争全部消除”。**

268项测试、类型检查、格式及包含C++辅助程序的生产构建通过。测试通过不证明没有缺陷。没有发现足以确认远程代码执行或普遍浏览器实例泄漏的证据；不将Critical 0当作安全保证。

## N01 · High · 已确认：独立空槽新增被集合级合并丢弃

**位置：** `src/core/ConfigMerge.ts:9–31`，尤其第14行order选择；`electron/storage.ts:47–59`；`src/App.tsx:283–289`。

**原因：** 页数组先比较整组ID顺序。如果latest和base的ID序列不同，结果只遍历latest；即使draft修改的是另一个空槽，也没有机会加入结果。收藏、工作区等ID数组也复用此逻辑，双方同时新增/改变结构时可能遗漏草稿项。

**本轮证据：** 本地临时探针直接调用当前mergeConfig：base.pages=[null,null]，draft仅在槽0新增A，latest仅在槽1新增B，结果槽0为null、槽1为B，`independentPageLost=true`。这是非冲突槽位，不只是两个操作抢同一位置。静态链路确认UI接收主进程session-update也调用该合并；具体真实鼠标并发时序未人工操作。

**影响：** 渲染端未保存的新增网页、暂存或其他集合结构操作可能无错误地丢失；最新远端结构得到保留，但独立本地新增没有保存。上阶段报告已注明集合结构冲突采用主进程优先，本次进一步确认该策略会吞掉不同空槽的独立操作。

**建议：** 页面按槽位变化与页面ID迁移分别表达，区分移动、增加、删除；集合按ID合并成员并单独解决顺序冲突。无法合并时显示冲突/重试，不能仅静默放弃。增加不同空槽同时新增、暂存与新增交错、工作区新增交错测试。

## N02 · High · 已确认：关闭会话自动保存后暂存造成重启配置双重归属

**位置：** `electron/storage.ts:97–105`（只冻结disk.session），`src/core/PageStash.ts:14–28`，`src/core/model.ts:128–141`；消费端`electron/BrowserManager.ts:252–281`。

**原因：** autoSaveSession=false时，磁盘session保留savedSession，但pageStash仍写入当前值。暂存把活动网页从session移到pageStash，持久化后旧session和新stash可同时拥有同一page.id。

**本轮证据：** 使用当前ConfigStore写入单页会话→关闭autoSaveSession→调用parkPage→save→创建新ConfigStore读取，测得`duplicateAfterRestart=true`，活动页ID与暂存内页ID相同。探针使用同步写入模式；生产350ms合并写入使用同一disk.session替换算法，但未通过应用重启UI人工验收。

**影响：** 重启可出现同一网页两处归属。BrowserManager的entries后遍历暂存项，按同一ID覆写slots为-1，可能把活动主网页按暂存处理并静音；再操作暂存可能进一步混淆归属。后续可见交互影响依据代码推导，未声称逐项动态复现。

**建议：** 明确“不保存会话”对暂存的边界，对活动页和带实例的暂存进行一致快照持久化，或保存独立但不重叠的恢复状态。补autoSaveSession开/关×暂存/取回/换位×重启测试，并检测跨集合ID唯一性。

## N03 · Medium · 已确认：暂停期间新媒体不会随策略解除恢复

**位置：** `electron/MediaSuspension.ts:14–17、21–25`。

**原因：** suspendMedia只将初次扫描时正在播放的媒体放入state.items；后续play事件会暂停新媒体，但没有给它创建恢复记录。resumeMedia只遍历state.items。

**本轮证据：** VM执行当前原始suspendMedia/resumeMedia脚本：原媒体先暂停，再触发新媒体play，解除暂停后`originalResumed=true`且`newMediaRemainsPaused=true`。这是模拟DOM，不是真实站点播放器验收。

**影响：** 用户打开设置或主窗口放大期间，网站换播放器/新增媒体后，退出设置/恢复分屏可能仍停播。此策略默认关闭，影响启用相应暂停选项的用户。

**建议：** 首次强制暂停新媒体时记录来源、是否应用主动暂停及用户取消状态；仅恢复由策略暂停且来源未改变的媒体。补暂停期间换播放器、换源、用户手动暂停和嵌入frame测试。

## N04 · Medium · 已确认（静态）：自动释放路径遗漏页面元数据清理

**位置：** `electron/BrowserManager.ts:158–168`与`:253–272`的两套清理路径；`electron/StashRelease.ts:82–87`。

**原因：** 自动释放回调删除views/requested/emulations/sentAudio及部分管理器数据，却保留slots、pageVolumes、muted、pageZooms及frameZoomPages/frameZoomFactors等。之后若用户关闭已释放的暂存项，sync清理循环只遍历views，找不到该ID，不能执行完整清理。

**影响：** 长期反复暂存→自动释放→关闭会使已不存在页面的ID/数值持续残留到程序退出。是元数据生命周期遗漏，不是已证明整个WebContents持续占用；实际堆增长量未测。

**建议：** 统一页面退役清理，区分释放原生实例但保留恢复数据与永久关闭；依据当前有效ID集合扫除所有映射，覆盖“释放后关闭且不重建”场景。

## N05 · Medium · 潜在可靠性风险：最终草稿接受失败后仍执行关闭

**位置：** `electron/main.ts:814–831`（finally无条件completeClose）；`electron/storage.ts:48–51`；`src/App.tsx:125–128`（closeReady失败被忽略）。

**原因：** close-ready中校验/基线查找/accept异常会跳入finally，仍调用completeClose。后者检查磁盘flush但并不知道最终草稿是否接收成功。基线只保留128版，过旧或非法草稿可能触发此路径。

**影响：** 可能将旧的主进程状态成功写盘后关闭，却丢弃最后一份渲染草稿，且前端没有提示提交失败。未做故障注入关闭验收，不称为本轮稳定复现。

**建议：** 区分“草稿接收失败”与“磁盘刷写失败”，只有前者成功或用户明确接受放弃修改后再关闭；设置错误恢复及超时策略。测过期revision、校验失败、写入失败与取消关闭。

## N06 · Medium · 已确认：配置引用与跨集合ID校验不完整

**位置：** `src/core/model.ts:57–64、128–141、148–177`；`electron/storage.ts:23–32`；`electron/BrowserManager.ts:252–281`。

**原因：** 只有单个snapshot的pages ID唯一性校验；未限制session与pageStash内page.id跨集合重复、stash条目ID重复/与内页不匹配，也未全面校验收藏分组引用和收藏/工作区ID唯一性。

**本轮证据：** 构造同一page同时出现在活动session与pageStash的配置，validateConfig正常接受，`duplicateActiveStashAccepted=true`。N02是正常操作写盘产生问题，N06是校验层本身容许问题，分属不同修复边界。

**影响：** 手改或导入配置可形成原生视图复用/归属冲突、隐藏收藏、按ID编辑删除歧义。没有声称绕过沙箱或执行任意代码。

**建议：** 增加配置级superRefine/一致性修复，清楚报告字段；校验stash内外ID和session跨集合唯一性、引用及集合ID唯一性，定义可兼容旧数据的迁移策略。

## N07 · Medium · 已确认（静态）：切小布局后选中槽位仍可指向隐藏页

**位置：** `src/App.tsx:71、324–346、346–354`及`:305`焦点更新。对应旧审计A11，本次仍存在。

**原因：** apply切换tree但不将selected收敛到可见slots；open的默认参数直接使用selected。工作区加载等替换布局路径也应统一校验。

**影响：** 先选高编号槽位，再切少槽布局，点击收藏可能导航隐藏页面；外层缩放快捷键也读取该selected。代码路径明确，本轮没有真实鼠标完整验收。

**建议：** 每次布局/会话替换后映射选中槽位到可见页，执行导航/缩放前二次检查。测试九宫格选第9槽→单窗口→点击收藏/外层快捷键。

## N08 · Medium · 潜在供应链风险：打包依赖仍命中minimatch公告

**位置：** `package.json:36`的electron-builder及`package-lock.json`中的minimatch 9.0.9/10.2.6传递依赖。对应旧A15；不是本轮新增6个独立漏洞。

**证据：** 本轮npm audit在线查询返回6个moderate受影响包条目，High/Critical为0；omit=dev返回0。公告为[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)，受影响范围>=7.0.0且<11.0.1，根因公告沿electron-builder打包工具链传播。

**影响与界限：** 不可信glob模式可能造成资源耗尽；尚未证明本项目的生产网页能触达该路径，不将生产依赖0公告等同于Chromium/整个供应链安全，也未执行恶意负载。

**建议：** 在隔离构建环境验证兼容修复，评估输入可达性。npm建议的electron-builder 25.1.0涉及降级/跨版本，不自动运行audit fix --force。

## N09 · Low · 维护建议：配置协调和页面生命周期职责继续集中

**位置：** `src/App.tsx:63`附近App；`electron/main.ts:36`附近启动/IPC；`src/core/ConfigMerge.ts:5–57`。

**原因与影响：** 界面入口同时负责草稿、确认状态、布局、收藏、工作区及保存；主入口协调配置、暂存、音频、权限、关闭等；通用递归合并用any和数据形状猜测区分页面。N01/N02/N04表明跨域不变量不容易被单个函数和现有测试覆盖。文件长度本身不是缺陷，不断言需要重写架构。

**建议：** 先为状态边界建立可执行不变量，再逐步集中页面迁移/退役和配置提交事务；以明确类型区分页面槽位与普通ID集合。保持现有纯核心层，不为审计引入状态库或无关重构。

## 安全、资源和性能的正向检查与边界

网页仍禁用Node、启用contextIsolation和sandbox；主IPC验证sender和mainFrame，权限规则按HTTPS origin校验，原生辅助程序固定主机/命令并限制输出、超时和取消。C++回调缓冲区等待HANDLE_CLOSING后释放，有明确生命周期设计；本轮未做Windows线程检测工具验收，不能因此证明无竞态。

操作日志仍走白名单与数值/布尔验证，异步串行写入并有限容量；未发现操作日志直接记录URL、输入文字或原始IPC载荷的路径。media-preload的audio-status诊断含原始错误不等于已落盘操作日志；需要保持这两个通道的隐私边界。配置JSON本身包含用户数据，应与脱敏日志区分。

已有显著性能改善：媒体扫描由DOM全量扫描转为注册/增量扫描与50ms合并，边界更新去重，配置/日志异步写入，后台节流和暂存释放有设置开关。此次未重做CPU/GPU/堆快照与长时直播采样，不把优化实现存在当作无性能瓶颈的证明。隐藏页面与5000个带page的导入暂存项仍可生成大量原生实例，建议做容量负载验收；这是待量化容量风险，不重复计为确认泄漏。

## 验证记录

以下均为2026-11-16本次运行，未借用旧结果文件。命令直接使用已有node_modules CLI，因为不安装依赖。

| 项目              | 命令/方法                                                                                                                | 本次结果                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 单元测试          | node node_modules/vitest/vitest.mjs run                                                                                  | 33文件、268测试通过                                                                             |
| 严格类型          | node node_modules/typescript/bin/tsc --noEmit                                                                            | 通过                                                                                            |
| 格式              | node node_modules/prettier/bin/prettier.cjs --check src electron scripts tests package.json tsconfig.json vite.config.ts | 通过；无独立ESLint配置                                                                          |
| 生产构建          | node node_modules/vite/bin/vite.js build；node scripts/build.mjs                                                         | 通过，包含MSVC构建native/live-status.cpp；未增版本、未打包安装器                                |
| 状态/媒体边界探针 | .cache/audit-2026-11-16内临时esbuild/Node/VM脚本                                                                         | 复现N01/N02/N03/N06，具体步骤及结果见各条；不提交临时产物                                       |
| 依赖公告          | node .npm-tools/bin/npm-cli.js audit --json --cache .cache/npm-audit                                                     | 完成查询，退出1表示发现公告：6 moderate条目                                                     |
| 生产依赖公告      | 同上加--omit=dev                                                                                                         | 退出0，0条公告                                                                                  |
| 原生review        | node scripts/review-probe.mjs                                                                                            | 退出0；旧音量快照、网站同步静音及本地新video接管检查通过                                        |
| 原生exchange      | node scripts/exchange-smoke.mjs                                                                                          | 退出0；六场景焦点/实例保留通过                                                                  |
| 资源兼容          | node scripts/resource-compat-smoke.mjs                                                                                   | 退出0；本地HTML全屏及beforeunload阻止关闭检查通过                                               |
| 资源策略综合      | node scripts/resource-policies-smoke.mjs                                                                                 | 初次25秒watchdog超时退出1；已有部分项目打印true，但整体验收未通过，不能用旧pass产物覆盖此次失败 |

执行环境外受控运行探针以避免Windows执行沙箱目录权限干扰，Electron应用沙箱仍开启；未更改系统ACL。真实鼠标OLE、IME、多屏DPI、所有真实网站、长时播放、故障注入关闭和大规模收藏/暂存负载未全面验收。具体新增原生探针后续结果见下方补充；真实站点诊断脚本即使退出0也必须检查每条结果，不能据退出码宣称全面通过。

## 修复顺序建议

先修N01/N02的数据一致性并补交错操作测试；随后处理暂停恢复、释放元数据和关闭失败路径；再补导入约束、可见选中槽位以及依赖修复评估。每项修复后仍按项目规则验证和提交；本轮纯审计不表示修复轮次完成，也不触发版本递增。

### 后续原生探针结果

- resource-policies单独复跑仍触发25秒watchdog，退出1；多项true之后未完成重复全屏/后续资源验收。没有确定是应用行为还是探针等待/桌面环境问题，不将其直接归因于N03/N04。
- fullscreen-sites默认真实网站探针仅取得一个Bilibili视频样本：探针观察到视频播放、主槽显示器全屏及副槽内全屏；随后长时间无进一步输出。仅结束本次命令行匹配的Electron探针进程，退出-1，后续站点未验收，不使用磁盘上的旧结果文件充当本轮记录。脚本本身没有对每条error提供非零汇总退出，其他轮次也需检查内容而非仅看退出码。
- stash-smoke退出0，22个布尔检查及pass=true；覆盖暂存顺序、关闭、拖放、取回和局部几何。并未覆盖N02的关闭自动保存后重启组合，故不矛盾。
- log-smoke初次退出1：22条记录，生命周期/UI/音频及敏感字符串过滤检查true，但webClick=false、pass=false。隐私过滤子项通过不能宣称日志整体回归通过；单独复核结果见追加记录。

UI审计说明：本轮未修改界面，无UI变更验收豁免或新设计规则；规范的对比度、完整键盘/焦点、全部主题、1080p/1440p/4K和Windows多DPI清单没有全面实测，保留待验收。报告不将规范要求全部列作已通过。

日志单独复核：`node scripts/log-smoke.mjs`再次退出1，仍为22条且webClick=false，其余上述子项true。属于可重复的验证缺口，尚未证明是网页事件丢失还是探针坐标/焦点等前提不满足。没有为了通过检查修改日志实现或断言。原生探针结论是review/exchange/resource-compat/stash通过，resource-policies/log未通过，真实站点full-screen诊断中止；不能概括为“原生检查全通过”。
