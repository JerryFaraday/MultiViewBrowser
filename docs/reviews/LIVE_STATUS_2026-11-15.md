# B站直播检测交付记录（2026-11-15）

## 主要修改文件

| 文件 | 职责 |
|---|---|
| [live-status.cpp](../../native/live-status.cpp)、[build-native.mjs](../../scripts/build-native.mjs) | C++异步HTTPS、构建和资源生成 |
| [LiveMonitor.ts](../../electron/LiveMonitor.ts)、[SettingsService.ts](../../electron/SettingsService.ts) | 调度、缓存、取消、配置生效和状态广播 |
| [LiveStatus.ts](../../src/core/LiveStatus.ts)、[model.ts](../../src/core/model.ts)、[Preferences.ts](../../src/core/Preferences.ts) | 房号/URL、三态、兼容迁移及设置约束 |
| [FavoriteEditor.tsx](../../src/components/FavoriteEditor.tsx)、[FavoritesList.tsx](../../src/components/FavoritesList.tsx)、[SettingsPanel.tsx](../../src/components/SettingsPanel.tsx) | 类别编辑、设置、指示灯 |
| [App.tsx](../../src/App.tsx)、[preload.ts](../../electron/preload.ts)、[api.ts](../../src/api.ts) | 受限IPC和React订阅 |
| [live-status.test.ts](../../tests/live-status.test.ts)、[UI专项](../../tests/electron/live-status-smoke.ts)、[原生专项](../../scripts/live-native-smoke.mjs)、[包专项](../../scripts/live-pack-smoke.mjs) | 状态、界面、网络及部署验证 |

另同步build脚本、package构建资源、版本元数据、样式、旧测试夹具和使用/开发文档；未改动BrowserManager、布局、交换、音频或网页导航模块。

## 模型与交互

功能针对收藏栏标签。Favorite.category默认web，bilibili-live保存规范化的正整数roomId字符串。旧配置不自动把直播URL改为直播类别。普通收藏原网址处理不变；转换时校验精确域名、HTTP/S和数字路径，拒绝凭据、异常端口、其他路径及房号不一致。新直播收藏生成HTTPS地址，已有标签转换可保留原完整地址及查询参数；切回普通网页后清空房号元数据并保留地址。

全局Preferences保存liveDetection=false、liveInterval=60（30–1800整数秒）。Config schema和设置UI均约束检测依赖bookmarksBar，隐藏收藏栏关闭检测；工作区和页面局部状态不包含检测偏好。运行状态独立于配置，仅按房号广播，重新启动从灰色重新获取。

## 原生请求及API实测

系统WinHTTP以WINHTTP_FLAG_ASYNC执行Send/Receive/Read回调，原生进程等待自身完成事件，Electron只异步spawn。C++限制主机、两个查询命令、数字参数、最多50 UID及1MB响应，不发送Cookie、不关闭TLS验证、不跟随重定向。请求阶段超时5秒，总等待12秒；主进程另设14秒进程期限。取消时终止子进程，正常路径等待HANDLE_CLOSING后释放回调状态和读取缓冲。

本轮直接验证[room_init](https://api.live.bilibili.com/room/v1/Room/room_init?id=35)和[get_status_info_by_uids](https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids?uids%5B%5D=474595627&uids%5B%5D=672328094)：code=0，解析UID和真实room_id，批量响应为按UID索引的对象；实际采样包含live_status=1和2。数字状态会随时间变化，不把该采样作为当前房间永久状态。0映射未开播，1映射直播，2为非实时轮播提示，其他或异常为未知。没有使用主页或直播播放器代替API验证。

主进程每次请求起始至少间隔1秒，UID缓存1小时；过期或成员不匹配重新解析，重复房号去重、别名相同UID合并。每批最多50是本应用保守请求大小，不声明为第三方官方长期上限。一轮完成后再按配置间隔定时，不重叠查询；间隔或房号集合改变会取消旧任务并重新调度，快速切换仍受全局限频。

## 验证

- 122项单测通过，其中35项新增：URL合法/非法、0和非数字房号、状态0/1/2/未知、旧配置、30/60/1800持久化和越界、缓存、房号/UID去重、51 UID分批、取消及过期结果、网络恢复、缺失程序、14秒超时终止。
- 实际Electron设置及收藏编辑专项通过：新建、编辑转换、原URL保留、非法域名拒绝、非数字输入阻止、删除后移除状态、保存间隔、四个标签显示两绿一红一灰、重复只查一次、普通标签不显示、指示灯在文字右侧且收藏栏高度不变、隐藏收藏栏后禁止启用并停止请求。实际界面截图核对通过；诊断和截图不提交。
- 实际C++原生网络专项成功解析两个房间并取得两成员批量响应。UI专项明确替换API响应以确定性覆盖各色，不把该替身测试当成实际网络状态测试。
- 既有设置、窗口交换六种实际焦点案例、独立Page Zoom专项通过；原网页管理、音频与布局算法未改动。
- 原生拖放回归通过；打包后的MultiViewBrowser.exe使用临时配置，恢复检测开启并通过包内LiveStatus.exe取得真实API状态，在收藏栏显示一枚指示灯。文件/产品版本0.2.2.0，原生资源及主进程/preload哈希核对一致，原启动目录已更新。
- 原有设置专项的开关数量预期由2更新为3，普通收藏夹具补齐新增字段；未改变旧功能的断言语义。

## 限制

外部API没有在本项目中获得稳定性承诺，接口更改、限流、代理或网络故障均可能显示灰色，随后周期重试。首次解析多个不同房间需要串行限频时间，状态不是实时推送；周期从一轮结束计时，不承诺精确墙钟刷新。未穷尽所有代理、服务器限流与混合DPI设备。轮播不视为实时开播，状态不跨进程缓存。当前原生构建仅验证Windows x64，编译需要已有MSVC与Windows SDK，最终用户运行无需编译器。

API原始响应、网址/标题/用户配置未加入操作日志，运行日志仍遵守项目隐私白名单；仅收藏配置本身按需求保存用户输入的房号和地址。
