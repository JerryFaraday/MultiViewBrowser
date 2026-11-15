# 斗鱼状态与收藏交互验收

日期：2026-11-15；版本：V0.2.5.0。

## 根因与实际链路

收藏category=douyu-live、规范化roomId → SettingsService/LiveCoordinator → DouyuAdapter排队 → nativeDouyuQuery/WinHTTP betard → room字段解析 → douyu:输入房号 → live-status IPC → FavoritesList状态灯。原链路已接入，房号前缀隔离也有效。

灰灯直接原因是旧严格0/1状态约定不接受真实show_status=2；常见非直播房间因此被归UNKNOWN。实际采样9999为show=1/loop=0，288016和252802为show=2/loop=0，真实房号均匹配。只读RoomApi对照分别为1/2/2（仅诊断对照，未作为不可靠的轮播备用判据）。本次将完整可靠状态2纳入OFFLINE，不再误报未知；未尝试将任意未知数值当成未播。

## 检测规则

- 两平台正常直播绿，确认未正常直播或轮播红，网络/API/解析/无法判断灰；失败不映射OFFLINE。
- LiveDisplay按平台房号维护最近成功时刻与失败轮次。轮询开始不改变显示；一轮失败可保留未过期有效结果，同轮重复结果不累计为多次失败。连续两轮失败、有效期耗尽或房号移除后转未知；成功后重置失败计数。
- 有效期为max(120秒,2×用户间隔+30秒)，默认150秒。独立过期计时不等待网络返回。B站补充逐房结果回调，避免其他房间的快照更新反复续期；原API主备路径、UID缓存及写入策略保留。
- 日志事件live.detect_error，action仅live.bilibili/live.douyu，status仅允许network/api/parse/indeterminate/unavailable等枚举。无URL、房号、标题、收藏名、原始错误或原始响应。HTTP/API异常、无效JSON/缺字段及不支持状态与网络错误分开。

## 收藏与设置

- 分组文字原位变输入框并聚焦选择，保存/取消按钮为16px线性SVG对勾/X，32×32px点击区、8px间距；普通态为铅笔/垃圾桶。Enter保存，Esc取消，IME组合中不提交。空白、超过100字符、重复名拒绝；X仅取消，不删除。分组/收藏删除保留确认，分组删除移至未分组的语义不变，数量移除。
- 统一FavoriteEditor：88px左标签、右侧控件，36px控制高度与16px行间距，小枚举上限220px。平台和房号在右侧同行，窗口低于480px时组合控件纵排以避免溢出。备注控件移除，原note数据随draft保留，旧配置缺note时默认空字符串。原验证/保存/取消及拖拽归属保留。
- 新preferences.showBookmarkGroups默认true，隐藏仅取消收藏栏标题/分隔符，按原分组与组内顺序显示全部项目。管理页始终显示分组。原showGroupNames名称不改。
- 两子开关在bar隐藏时以真实disabled禁用；前端更新函数及ConfigStore.accept保护已隐藏状态下的值，恢复bar不重置。纯读取/导入继续兼容既有偏好。

## 验证结果与限制

- 225项单测通过（新增10项）；类型/生产构建/格式通过。
- 真实Electron临时配置专项全部通过：两平台三态/轮播、去重/转换、栏高、行内选择/Enter/Esc/保存/取消、重名/空名、图标尺寸/Tooltip、无数量、同行控件、旧备注、显示分组顺序、依赖禁用及恢复。删除确认只在临时夹具中自动接受，产品确认保留。
- 设置专项通过。原测试中的过时添加按钮定位、开关数与临时确认处理已更新；不能将之前失败隐去为从未发生。
- C++真实斗鱼采样：9999 LIVE 134ms，288016 OFFLINE 357ms，252802 OFFLINE 393ms。独立打包以空会话、静音、临时配置调用实际B站35、斗鱼9999/288016，分别绿/绿/红，三枚灯及退出后B站缓存保存通过。
- 原启动目录已复制同一验证包并再次通过上述真实查询；Windows文件/产品版本0.2.5.0，原生资源哈希匹配。设置、六种交换焦点和Page Zoom回归通过。
- 截图人工检查了当前显示器下的收藏同行编辑页，图标与说明、输入控件未重叠；基础版图标/对勾/X均来自项目已有SettingsIcon线性SVG体系，无新框架。
- Design system compliance：按用户明确覆盖的分组行内/重复名禁止、同行字段、移除备注和轮播红灯要求实施，已同步UI_DESIGN_SYSTEM第13节。未修改其他设置页布局。未穷尽四主题、各分辨率和系统100/125/150%DPI组合；未对未改设置类别逐一重拍截图。真实轮播仍用模拟响应验证，第三方接口变化/长期断网未全量实测；时钟过期与连续失败使用可控测试。

## 主要文件

- 检测：electron/live/Douyu.ts、DouyuNative.ts、LiveCoordinator.ts、新增LiveDisplay.ts、electron/LiveMonitor.ts，以及src/core/LiveStatus.ts、OperationLog.ts。
- 收藏/设置：src/components/FavoritesList.tsx、FavoriteEditor.tsx、SettingsIcon.tsx、SettingsPanel.tsx；src/App.tsx、src/style.css、src/core/FavoritesManager.ts、Preferences.ts、model.ts与electron/storage.ts。
- 验证：新增tests/favorites-repair.test.ts，更新直播解析/平台/原生用例、electron/live-status-smoke.ts、settings-smoke.ts、scripts/live-pack-smoke.mjs；版本元数据、手册、设计规范及本记录同步。
