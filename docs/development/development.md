# 开发指南

## 环境与安装

建议Windows x64、Node.js 24和npm。实际依赖以[package.json](../../package.json)与[锁文件](../../package-lock.json)为准；不要求安装全局Electron、TypeScript或打包器。

V0.2.2.0起，构建还需要已有的Visual Studio C++ Build Tools（x64编译器）和Windows 10/11 SDK；不通过项目脚本自动安装全局软件。`scripts/build/build-native.mjs`通过vswhere定位工具链，使用C++20、静态CRT与系统WinHTTP库生成`dist-native/LiveStatus.exe`。`npm run build`及开发启动会编译该模块；最终运行免安装程序不需要安装编译器。当前原生构建面向Windows x64。

```powershell
git clone https://github.com/JerryFaraday/MultiViewBrowser.git
cd MultiViewBrowser
npm ci
npm run dev
```

npm ci按锁文件安装；仅在有意更新依赖时使用npm install并审查锁文件变化。Electron下载需要网络及足够磁盘空间。开发脚本先构建Electron入口，然后启动127.0.0.1:5173的Vite及Electron，端口冲突时会报错。

## 运行与检查

```powershell
npm run typecheck
npm test
npm run format:check
npm run build
npm start
```

直播检测专项：`node scripts/smoke/live-status-smoke.mjs`运行隔离UI/IPC测试（明确建模API响应）；`node scripts/smoke/live-native-smoke.mjs`使用实际编译的C++进程访问当前API，需网络，不使用Cookie。两者均在构建后执行。单测中的计时器和进程替身验证取消/超时，不替代真实网络测试。

已有完整免安装构建后，可运行`node scripts/smoke/live-pack-smoke.mjs`，以临时配置启动真实EXE并验证包内原生查询及指示灯。此脚本使用本地临时调试端口检查测试进程，退出时关闭，不修改实际用户配置。

打包通过extraResources复制原生程序到`resources/live-status/LiveStatus.exe`，不放入ASAR执行；源代码在`native/live-status.cpp`。不要只复制主EXE，也不要提交dist-native、运行日志、诊断JSON或浏览器配置。

build执行TypeScript检查、Vite、esbuild及C++原生模块编译；start只是electron .，需要已有dist、dist-electron和dist-native。format:check只检查；format会重写源码，不应为文档整理随意执行。

类型检查启用noUnusedLocals/noUnusedParameters。测试方法及历史31项通过的范围见[验证记录](validation.md)，通过检查不等于不存在已知缺陷。

## Windows打包

```powershell
npm run pack
npm run dist
```

pack先构建再生成release/win-unpacked目录；运行MultiViewBrowser.exe必须保留整个目录。根目录[启动脚本](../../Start-MultiViewBrowser.cmd)指向该路径。dist先构建再生成NSIS，支持选择安装目录，但历史交付尚未验证完整安装器流程。

历史环境已使用本地Electron分发目录、跳过资源编辑和签名完成免安装构建：

```powershell
npm run build
node node_modules/electron-builder/cli.js --win --dir '-c.electronDist=node_modules/electron/dist' '-c.win.signAndEditExecutable=false'
```

仅需要与既有环境复现时使用该替代命令。它会跳过资源编辑和签名，exe图标/元数据可能保留Electron默认值；这不是正式签名发布方案。

## 本机缺少全局npm的情况

原开发机使用本地.npm-tools工具目录，可把npm替换为 `node .npm-tools/bin/npm-cli.js` 执行普通命令。该目录不在Git中，新克隆应使用正常Node/npm环境，不应假定目录存在。pack/dist脚本内部仍调用npm；若进程找不到npm，可分别运行build和上一节打包器直调命令。不要为此修改系统级Git配置或安装未经授权的全局软件。

## 版本、隐私与提交

显示版本使用Va.b.c.d，源为[version.json](../../version.json)。a/b仅按用户明确要求调整；新增功能递增c并重置d，现有功能优化/UI/交互/小修复递增d。一个任务只按最高适用级别递增一次。审计过程及修复不触发d，仅用户明确确认本轮审计修复结束后递增c一次；纯审计、测试、文档及未完成开发不递增，也不自行认定审计结束。

完成后使用node scripts/maintenance/bump-version.mjs --kind feature或--kind revision；审计结束需用户已确认，再使用--kind audit --audit-confirmed。重建/复测不重复递增。用户明确指定版本时使用--set a.b.c.d，a/b变更还需--authorized标记已有用户授权，不能把命令标记当作授权本身。本次用户指定V0.2.0.0。高位变化时更低位全部归零。

脚本同步version.json、package.json、package-lock.json、Windows产品版本字段shortVersionWindows、buildVersion、安装包文件名及README/使用指南的当前版本引用。package.json.version因npm/Electron依赖三段semver，映射为a.b.c；完整四段用于界面、Windows文件/产品版本及构建版本。历史CHANGELOG版本不回写。

日志只能使用允许的事件标识及受控数值/布尔元数据，禁止网址、标题、输入、名称、凭据和原始错误。详细约束见[AGENTS](../../AGENTS.md)。

```powershell
git add <待提交文件>
node scripts/maintenance/check-secrets.mjs
git diff --cached --check
```

敏感扫描针对暂存区，零暂存文件不能作为扫描成功的证据。当前扫描器会将二进制文件标为需人工复核；公开文档图片应人工检查内容及元数据，不能为图片直接关闭扫描器。依赖、构建、日志、生成诊断结果、环境配置和浏览器数据不纳入Git，详见[.gitignore](../../.gitignore)。

文档编写入口见[分类映射](../DOCUMENTATION_MAP.md)。productName为MultiView Browser，executableName为MultiViewBrowser；appId、包名及既有用户数据路径保持兼容。

设置专项回归：node scripts/smoke/settings-smoke.mjs；跨进程启动/退出回归：node scripts/smoke/startup-smoke.mjs。均使用隔离配置及本地网页，数据清理仅针对测试临时目录；真实设备授权和所有DPI组合仍需人工验证。配置分层见[设置说明](../user/settings.md)。

## 测试产物目录

开发/维护命令仍从项目根目录运行；原生测试源码在tests/electron，运行器在scripts/smoke，共享工具在scripts/lib。原有build/dev/smoke/drag/version便捷入口保留转发。

截图/结果/诊断统一写入test-artifacts/<模块>/；读取用artifactPath，写入用artifactOutputPath。同名旧结果归入test-artifacts/archive/<run-id>/<模块>/，同批次多个模块共用运行ID，重复文件编号保留。子进程继承MVB_TEST_RUN_ID，跨命令套件可预先设置同一安全ID。旧版模块内archive不删除。可用MVB_TEST_ARTIFACT_ROOT隔离并行验证，避免并行任务共用同一个最新结果目录。正式基准和脱敏文档图片仍在tests或docs，生成产物不提交。

npm run pack及dist继续输出正式release/；临时验证使用npm run pack:validation输出out/validation/，pack冒烟仍可显式传入exe路径。dist*是构建中间目录，既有临时包保留在out/legacy-validation/。开发启动回归使用node scripts/smoke/dev-smoke.mjs，自动使用隔离profile；开发入口可透传Electron参数，普通启动命令不变。

目录快照默认使用node scripts/maintenance/file-tree.mjs写入测试产物；临时根快照只能按用户明确要求生成。详细规则和验证见[第二轮整理](../reviews/engineering-organization-2026-11-17.md)，长期约定见[AGENTS](../../AGENTS.md)。应用userData、logs及持久化规则不变。
