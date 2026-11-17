# 第二轮工程目录整理与验证

日期：2026-11-17。基线：870e3c4（已包含fc48fd3首轮目录整理及其后的布局修复），开始时main与origin/main同步且工作区干净。显示版本保持V0.2.6.1，package版本保持0.2.6；本轮未升级版本或依赖，未修改运行时配置、页面、音频、布局及持久化逻辑。

## 实际调整

完整文件对应关系见[迁移清单](engineering-organization-2026-11-17-moves.json)：84个跟踪文件移动，保留原文/实现，并适配引用；其中原有便捷入口及四个文档旧路径以短导航文件兼容。另保留并移动9项本地生成文件/目录，无删除。

```text
scripts/
  build/        Electron bundle、HTML复制、C++编译
  dev/          Vite与Electron开发启动
  smoke/        原生冒烟、诊断、基准及开发启动验证
  maintenance/  版本工具、暂存区敏感信息检查、文件树生成
  lib/          产物路径与版本策略
  *.mjs         既有build/dev/smoke/drag-smoke/bump-version便捷入口转发
docs/
  user/         使用指南、设置参考
  design/       唯一现行UI规范
  development/  架构、开发、问题、验证、开发日志
  reviews/      历史审计、交付证据、迁移清单
tests/          单元测试，沿用当前扁平组织
  electron/     原生集成探针与测试夹具
release/        正式发布包（保留win-unpacked和根目录启动器约定）
out/
  validation/   新的临时验证包
  legacy-validation/  8份既有临时包，原样保留
test-artifacts/
  <module>/     各模块最新结果及截图
  archive/<run-id>/<module>/  本批次覆盖前的结果，重复文件自动编号
```

- 脚本ESM相对导入、版本工具基于import.meta.url的根路径、测试共享工具导入、package命令、文档相对链接及应用“使用指南”源码链接均已修正。工作目录约定仍为仓库根目录。
- 不改变`npm run dev/build/smoke/smoke:drag/version:bump`等现有命令；旧根脚本为薄转发，新脚本使用分类路径。非便捷诊断脚本路径以文档中的新路径为准。
- 新增`npm run pack:validation`，生产打包配置仍输出release；两个pack探针默认读取out/validation，仍允许显式传入exe路径。版本断言从硬编码旧版本改为精确读取version.json比较，未修改软件版本。
- 开发入口透传显式Electron参数，使开发冒烟可使用隔离的临时用户目录，普通无参数启动不变。新增dev-smoke验证Vite、实际开发窗口、IPC及正常退出；限定等待并清理其创建的进程树，不接触日常配置。
- 原有release下validation-*、settings-fullpage和zoom-feedback-validation目录移入out/legacy-validation；out/first-layout/initial-probe.json归入test-artifacts/first-layout。未删除其文件、配置或日志。
- 历史报告改为小写kebab-case主题及日期；无可靠原始日期者明确使用`archived-2026-11-02`归档日期，未伪造审计日期。证据JSON与同主题报告保留同目录和一致前缀。

## 文档职责

[文档索引](../DOCUMENTATION_MAP.md)列出权威入口。USER_GUIDE为现行一般使用说明，SETTINGS是专题参考；USER_MANUAL是V0.1.1.12历史手册，全文归档。UI_DESIGN_SYSTEM包含初始规范及后续第12、13节实现/交互要求，是现行设计权威；MULTIVIEW_DESIGN_SYSTEM的初始全文归档，明确撤销其历史权威声明。未仅因文件名相似合并或删除内容。

## 暂缓的源码分层

- electron已有live领域目录；BrowserManager、主入口、设置、媒体、弹层之间存在生命周期和资源路径依赖。preload及HTML运行路径由bundle目录决定。进一步按browser/settings/media/ui/logging拆分会扩大原生回归面，本轮只评估，未强行搬迁。
- tests现有领域文件可直接定位，Electron夹具已独立；尚无足够收益再建立多个少文件目录。测试文件沿用`.test.ts`，JS版本策略测试保留`.test.js`，原生夹具保留`-smoke.ts`等后缀。
- src已按components/core组织；主类和组件PascalCase、hook以use开头。既有辅助模块的历史命名不做机械重命名；新文件遵循AGENTS约定。后续在实际职责变更时再局部整理。

## 产物生命周期与隐私

- `.cache/`是下载/工具缓存及本机诊断；`.npm-tools/`是本地npm工具，不是发布资源。`dist/`、`dist-electron/`、`dist-native/`为构建中间产物，release为正式包，out为临时包，全部忽略。将通用`build/`忽略收窄为根`/build/`，确保scripts/build源码可正常提交。
- 原生探针仍输出bundle到dist-electron：主入口、弹层、preload相对路径需要同一资源目录。正式包通过package.json显式文件白名单排除探针bundle；未为目录整洁修改运行时资源定位。
- 测试路径统一由scripts/lib/test-artifacts.mjs生成并自动建目录。稳定最新路径保证读方兼容；同批次备份集中在archive/run-id/module，子进程继承MVB_TEST_RUN_ID；跨命令套件可事先设置同一安全ID。重复写同名备份采用文件编号，不覆盖。旧的逐文件归档保留，因无法可靠推断历史运行关系，不伪造批次或删除。
- 本轮不建立自动删除策略。test-artifacts、缓存、旧包仍可能持续占盘；清理应另行审阅并授权。用户要求的根PROJECT_FILE_TREE_TEMP.txt已忽略；维护脚本默认将快照写入test-artifacts，只有显式路径才写根目录。
- OperationLogger每次启动新文件，约16 MiB后丢弃后续普通记录并在结束报告容量计数；约200ms合并异步写入，无本轮新增同步写入。LogRetention按配置天数清理匹配命名、非当前且无存活所属进程的日志；0默认不自动按天清理，显式“清理历史”使用0表示清理全部可清理历史。不是无限分卷轮转，也没有跨会话目录总容量上限。本轮未改变这些产品规则。
- 运行时logs、userData、分区、配置保存位置不变。测试JSON、网页截图、临时profile及诊断可能含网址、标题、账号或本机路径，均不能因处于测试目录就视为已脱敏。ignore防误提交，并非加密/脱敏机制。正式文档证据需单独检查；既有操作日志的allowlist及禁记敏感字段规则继续生效。

## 验证

命令均从仓库根目录运行，使用已安装依赖，未安装新依赖。详细结果见下表；通过测试仅说明覆盖场景通过。

| 命令/验证                                                                                                                  | 结果                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node node_modules/typescript/bin/tsc --noEmit`                                                                            | 通过，项目strict/noUnused配置                                                                                                                                                                                                                                                                           |
| `node node_modules/vitest/vitest.mjs run`                                                                                  | 38文件、293测试通过；新增脚本路径/文档权威入口验证，增强产物递归扫描和批次备份断言                                                                                                                                                                                                                      |
| `node node_modules/prettier/bin/prettier.cjs --check src electron scripts tests package.json tsconfig.json vite.config.ts` | 通过                                                                                                                                                                                                                                                                                                    |
| `node node_modules/vite/bin/vite.js build`及`node scripts/build.mjs`                                                       | 通过，Electron及MSVC C++辅助程序构建成功                                                                                                                                                                                                                                                                |
| `node scripts/smoke/dev-smoke.mjs`                                                                                         | 通过，隔离profile；首次探针遇Vite导航上下文替换，改为有界启动就绪重试后通过                                                                                                                                                                                                                             |
| `node scripts/smoke/startup-smoke.mjs`                                                                                     | save-off、restore、blank三种启动均通过；受限环境首次原生启动退出1，无诊断，桌面环境复跑通过                                                                                                                                                                                                             |
| `node scripts/smoke/settings-layout-smoke.mjs`                                                                             | 5种视口/DPI及截图、滚动、返回、重置通过                                                                                                                                                                                                                                                                 |
| `node scripts/smoke/stash-smoke.mjs`                                                                                       | 暂存、取回、换位等断言通过                                                                                                                                                                                                                                                                              |
| `node scripts/smoke/log-smoke.mjs`                                                                                         | 通过，真实点击计数1，webClick及隐私断言通过                                                                                                                                                                                                                                                             |
| `node scripts/smoke/page-zoom-smoke.mjs`                                                                                   | 通过，独立缩放、焦点、换位及重置                                                                                                                                                                                                                                                                        |
| electron-builder临时包                                                                                                     | 默认下载因GitHub域名解析失败；以`--config.electronDist=node_modules/electron/dist`复跑成功。完整参数：`--win --dir --config.directories.output=out/validation --config.win.signAndEditExecutable=false --config.npmRebuild=false`。本机npm不在PATH，builder使用已支持的依赖遍历回退完成；未掩盖环境限制 |
| `node scripts/smoke/performance-pack-smoke.mjs`                                                                            | 通过，preload完整性、版本、配置保存、正常关闭、重启恢复；读取新临时包默认路径                                                                                                                                                                                                                           |

便捷入口node scripts/smoke.mjs的本次smoke-results.json为pass=true，主副音频策略断言通过；node scripts/smoke/first-layout-smoke.mjs的全部首帧/隐藏/复用断言通过。验证包asar清单未包含smoke/probe/diagnostic的原生bundle。暂存敏感扫描137个文件，发现0项；git diff --cached --check通过。

node scripts/smoke/exchange-smoke.mjs退出0，并核对本次生成的exchange-smoke-results.json：所有换位的focused/sameInstance及preserved断言为true，pass=true。最终类型检查、293测试及代码格式检查再次通过。README、AGENTS及全部docs共241个本地Markdown链接解析有效，未验证外部网络链接。Git交付执行暂存差异检查、敏感扫描、提交及普通push；提交号以交付记录为准。

未进行联网真实网站兼容性、NSIS安装器签名、全平台验收或内存/CPU量化基准；本轮未改业务热路径，不声称已证明无性能回归。无自动删除数据，归档路径管理每次写入增加目录存在检查和必要rename，未引入轮询或DOM扫描。
