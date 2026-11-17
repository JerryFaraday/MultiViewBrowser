# V0.2.6.1 首次布局竞态修复

隔离原生 Electron 测试确认用户描述的调用链：bounds 在实例不存在时缓存布局但无法应用；随后 sync 创建隐藏的0×0视图，未重新协调。dom-ready仅在视图已可见时调用bounds，前端boundsSignature又抑制相同请求，形成可见性死锁。交换改变布局请求可解除该状态。与网站请求失败无关。

BrowserManager.sync在创建、删除、归属变化后重放最新缓存布局；无关配置不触发该协调。原有setBounds/setVisible/模拟参数去重及前端boundsSignature全部保留。布局应用按当前可见槽位过滤，设置页开启时隐藏原生网页，避免过期请求重新显示暂存或关闭页面；全屏仍走原有角色分支。没有增加轮询、刷新、交换或重建补救。

低开销时间戳诊断仅存在于tests/electron/first-layout-smoke.ts，不进入正式操作日志，不记录网址、标题或用户输入。修复前：72ms收到bounds（实例不存在），82ms sync后visible=false、bounds=0×0。修复后一次本地夹具：72ms收到bounds，78ms sync后visible=true、bounds=(10,62,900,506)，106ms dom-ready，113ms主框架成功加载；捕获到夹具颜色。帧捕获并非物理显示器呈现时间；首次紧接加载的捕获曾返回UnknownVizError，测试随后单独等待合成准备，不在产品代码中增加等待。

验证：291项单测、类型/生产构建通过；原生首次布局10项检查（两种调用顺序、实际内容捕获、重复请求、设置、暂存、同实例返回、关闭保护）通过。30次同状态重放新增setBounds/设备模拟调用均为0。资源策略专项的主/副全屏、交换、F11、跨域iframe和暂存释放恢复通过。没有穷尽真实网站、GPU和所有Windows DPI组合。

复跑：node scripts/smoke/first-layout-smoke.mjs；产物沿用scripts/lib/test-artifacts.mjs集中管理。此次仅修改BrowserManager及专项测试、版本与文档，不调整UI样式；设计规范验收适用例外：本轮未更改视觉组件。
