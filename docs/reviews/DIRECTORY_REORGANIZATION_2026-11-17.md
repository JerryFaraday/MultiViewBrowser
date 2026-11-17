# 目录整理与测试产物管理（2026-11-17）

## 范围和目录

任务开始时Git工作区干净。此次仅整理文件组织、测试源码位置和产物路径，不改应用功能、UI、持久化机制、依赖或版本；V0.2.6.0不变。

```text
scripts/                     原有开发/维护/Smoke命令入口
  test-artifacts.mjs          统一测试产物路径和旧结果归档
  test-artifacts.d.mts        TypeScript声明
 tests/                      单元测试
  electron/                  33个原生测试/诊断及测试辅助源码
 test-artifacts/             本地生成产物（Git忽略）
  scrollbar/ settings/ startup/ stash/ ui/
  video-resize/ watchlater/ worker-spawn/
  appearance/ bookmark-dependencies/ live/
  audio/ bilibili/ drag/ exchange/ fullscreen/
  interaction/ lifecycle/ performance/ popup/ resource/ review/ rooms/ core/
    archive/<时间-唯一后缀>/  重跑前保留的历史产物
 .cache/bootstrap/           本机下载的工具引导压缩包
 docs/images/                正式项目截图，原位保留
 docs/reviews/               已归档报告/机器证据，原位保留
```

共移动193个本地文件：191份截图/JSON（含原out/performance-validation中的设置截图），以及npm-bootstrap.tgz和electron-runtime.zip两个工具下载包。移动时校验191份产物SHA-256；重跑测试后再次扫描新目录及archive，191份原内容均存在。没有删除或覆盖旧结果。逐文件路径/哈希及33个源码移动关系见[移动清单](DIRECTORY_REORGANIZATION_2026-11-17_MOVES.json)，不提交截图和原始诊断内容。

33个测试源码从electron/（含live/douyu-probe.ts）迁至tests/electron/。scripts/*.mjs的公开启动命令保持不变，esbuild entryPoints、相对/动态import、测试辅助引用和文档链接同步适配。dist-electron中的临时测试bundle文件名不变；生产build入口、打包files配置、开发入口和版本管理脚本未变。Git通过重命名检测追踪源码移动，不复制一套平行测试。

## 路径和保存规则

- `artifactPath(filename)`用于读取最新结果；`artifactOutputPath(filename)`用于写入。两者共用模块分类，自动创建目录，拒绝包含目录分隔符或越界的文件名。
- 默认从项目根目录运行既有scripts命令，输出到test-artifacts/；已有开发/构建命令本来就以仓库根目录为工作目录。需要隔离一次验证时可设置`MVB_TEST_ARTIFACT_ROOT`，子进程继承同一值。
- 写入同名文件前，将已有文件移到同模块archive时间目录，随后写入稳定的最新路径。读路径不会触发归档。无自动清理策略，不擅自删除历史结果；并行运行同一个测试仍应使用不同的环境输出根目录，以免竞争同一个“最新”文件。
- 动态文件名（主题、启动模式、尺寸/基线、resize标签）与固定文件名使用同一函数。截图、结果和诊断在同模块下。
- interaction结果的stat/mtime与JSON读取同样调用artifactPath，不再读取根目录旧文件。
- settings-layout原先out/performance-validation的截图写入settings模块，不再额外创建旧目录。
- 未改写用户选择的导出路径、Electron userData、临时测试会话配置目录、Cookie/浏览器存储、logs/、构建dist目录或生产持久化路径。这些路径属于运行机制而非散落测试结果。
- .gitignore统一忽略test-artifacts/，移除旧根目录产物掩码。意外回归写回根目录将显露为未跟踪文件，而不是被旧规则藏住。
- 新增tests/artifacts.test.ts：模块读写一致、自动建目录、历史结果保留、拒绝越界，以及测试/诊断代码不得重新添加直接字面量根路径写入的守卫。

历史文档中的产物名称更新为新路径，日期/当时通过失败结论不改；正式报告内DATA.json对象键是已归档证据标签，不作为当前文件路径批量重写。

## 验证结果与范围

| 验证                                                             | 本次结果                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| node node_modules/typescript/bin/tsc --noEmit                    | 通过，包括迁移后的原生测试源码                                                                                                  |
| node node_modules/vitest/vitest.mjs run                          | 迁移后37文件290测试通过；最后新增根路径守卫后结果见末尾                                                                         |
| Prettier项目检查                                                 | 通过                                                                                                                            |
| node node_modules/vite/bin/vite.js build；node scripts/build.mjs | 通过，含C++辅助程序。生产前端bundle哈希仍为Crkifx1-，未变更产品代码                                                             |
| node scripts/startup-smoke.mjs                                   | save-off/restore/blank三个模式均pass；JSON位于startup/                                                                          |
| node scripts/settings-layout-smoke.mjs                           | 5种尺寸/DPI/缩放夹具及滚动/退出检查通过；10张design-system截图、layout截图和JSON位于settings/                                   |
| node scripts/stash-smoke.mjs                                     | 22项及pass通过，stash截图和JSON位于stash/                                                                                       |
| node scripts/log-smoke.mjs                                       | 通过，日志汇总JSON位于log模块（分类为core）；产品logs/路径不变                                                                  |
| node scripts/settings-smoke.mjs                                  | 初次newGroupSaved=false，复跑原断言通过，截图/JSON在settings/；整理前源码基线也通过，保留初次失败，不宣称其时序稳定性问题已修复 |
| node scripts/interaction-smoke.mjs                               | 5E外部frame unavailable，退出1；读取逻辑保留本轮mtime与pass检查，未用迁入的旧结果冒充通过                                       |
| node scripts/review-media-probe.mjs                              | VM夹具changes is not iterable，退出1；Git HEAD整理前脚本同样失败，定位为已有夹具兼容问题，本轮不作无关修复                      |
| 迁移完整性                                                       | 193文件保留；191产物哈希全部可匹配；根目录png及*-results/*-diagnostic JSON均为0                                                 |

本轮未逐一运行需要真实直播、登录或外部服务的所有诊断；未把上述失败/未运行项标为通过。没有改变断言来通过路径验收。开发启动入口与生产/版本脚本无差异，版本策略单元测试包含在全量测试；未启动会污染真实用户会话的dev主程序，也未运行版本递增。

## 根目录保留项及原因

| 项目                                                                                            | 原因                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| package.json/package-lock.json、tsconfig.json、vite.config.ts、index.html、version.json         | 依赖、编译、Vite及版本工具链所需                                                                                           |
| .gitignore、.git/、AGENTS.md                                                                    | Git和项目规范入口                                                                                                          |
| README.md、CHANGELOG.md                                                                         | 标准项目说明/版本历史入口，本轮不搬迁                                                                                      |
| Start-MultiViewBrowser.cmd、MultiViewBrowser.lnk                                                | 便捷启动入口；后者是已忽略的本机快捷方式，未擅自改动                                                                       |
| src/、electron/、native/、assets/                                                               | 产品代码与正式资源，不是测试产物                                                                                           |
| node_modules/、.npm-tools/、.cache/、dist/、dist-electron/、dist-native/、release/、out/、logs/ | 已归类依赖、工具、缓存、构建或运行目录；不为了清空根目录改变路径约定。out/performance-validation旧图片已移动，空目录未删除 |

不移动docs/images/scale-popup.png及两份已跟踪审计/性能DATA.json，它们是正式文档资源与归档证据，不是待忽略的临时输出。

最终新增根路径守卫后：37个文件、291项Vitest测试全部通过；类型与项目格式检查通过，原产物哈希及相同内容副本数量均核对保留。根目录截图和结果/诊断JSON数量为0。未更改版本、运行时数据路径及产品源码。
