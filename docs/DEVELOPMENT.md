# 开发指南

## 环境与安装

建议Windows x64、Node.js 24和npm。实际依赖以[package.json](../package.json)与[锁文件](../package-lock.json)为准；不要求安装全局Electron、TypeScript或打包器。

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

build执行TypeScript检查、Vite及esbuild；start只是electron .，需要已有dist和dist-electron。format:check只检查；format会重写源码，不应为文档整理随意执行。

类型检查启用noUnusedLocals/noUnusedParameters。测试方法及历史31项通过的范围见[验证记录](VALIDATION.md)，通过检查不等于不存在已知缺陷。

## Windows打包

```powershell
npm run pack
npm run dist
```

pack先构建再生成release/win-unpacked目录；运行MultiViewBrowser.exe必须保留整个目录。根目录[启动脚本](../Start-MultiViewBrowser.cmd)指向该路径。dist先构建再生成NSIS，支持选择安装目录，但历史交付尚未验证完整安装器流程。

历史环境已使用本地Electron分发目录、跳过资源编辑和签名完成免安装构建：

```powershell
npm run build
node node_modules/electron-builder/cli.js --win --dir '-c.electronDist=node_modules/electron/dist' '-c.win.signAndEditExecutable=false'
```

仅需要与既有环境复现时使用该替代命令。它会跳过资源编辑和签名，exe图标/元数据可能保留Electron默认值；这不是正式签名发布方案。

## 本机缺少全局npm的情况

原开发机使用本地.npm-tools工具目录，可把npm替换为 `node .npm-tools/bin/npm-cli.js` 执行普通命令。该目录不在Git中，新克隆应使用正常Node/npm环境，不应假定目录存在。pack/dist脚本内部仍调用npm；若进程找不到npm，可分别运行build和上一节打包器直调命令。不要为此修改系统级Git配置或安装未经授权的全局软件。

## 版本、隐私与提交

显示版本使用Va.b.c.d，源为[version.json](../version.json)。a/b仅按用户明确要求调整；新增功能递增c并重置d，现有功能优化/UI/交互/小修复递增d。一个任务只按最高适用级别递增一次。审计过程及修复不触发d，仅用户明确确认本轮审计修复结束后递增c一次；纯审计、测试、文档及未完成开发不递增，也不自行认定审计结束。

完成后使用node scripts/bump-version.mjs --kind feature或--kind revision；审计结束需用户已确认，再使用--kind audit --audit-confirmed。重建/复测不重复递增。用户明确指定版本时使用--set a.b.c.d，a/b变更还需--authorized标记已有用户授权，不能把命令标记当作授权本身。本次用户指定V0.2.0.0。高位变化时更低位全部归零。

脚本同步version.json、package.json、package-lock.json、Windows产品版本字段shortVersionWindows、buildVersion、安装包文件名及README/使用指南的当前版本引用。package.json.version因npm/Electron依赖三段semver，映射为a.b.c；完整四段用于界面、Windows文件/产品版本及构建版本。历史CHANGELOG版本不回写。

日志只能使用允许的事件标识及受控数值/布尔元数据，禁止网址、标题、输入、名称、凭据和原始错误。详细约束见[AGENTS](../AGENTS.md)。

```powershell
git add <待提交文件>
node scripts/check-secrets.mjs
git diff --cached --check
```

敏感扫描针对暂存区，零暂存文件不能作为扫描成功的证据。当前扫描器会将二进制文件标为需人工复核；公开文档图片应人工检查内容及元数据，不能为图片直接关闭扫描器。依赖、构建、日志、生成诊断结果、环境配置和浏览器数据不纳入Git，详见[.gitignore](../.gitignore)。

文档编写入口见[分类映射](DOCUMENTATION_MAP.md)。productName为MultiView Browser，executableName为MultiViewBrowser；appId、包名及既有用户数据路径保持兼容。


设置专项回归：node scripts/settings-smoke.mjs；跨进程启动/退出回归：node scripts/startup-smoke.mjs。均使用隔离配置及本地网页，数据清理仅针对测试临时目录；真实设备授权和所有DPI组合仍需人工验证。配置分层见[设置说明](SETTINGS.md)。
