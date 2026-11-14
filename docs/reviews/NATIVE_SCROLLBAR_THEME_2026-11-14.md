# 原生网页滚动条主题适配（V0.2.1.6）

环境：Windows，Electron 45.2.1 / Chromium 156.0.8078.75。结论来自原生滚动条像素、样式、交互及真实Bilibili页面对照，不以主题API返回值代替实际绘制结果。

## 根因

此前主题实现只为应用本地界面设置颜色令牌和`color-scheme:dark`，没有显式同步`nativeTheme.themeSource`，系统使用浅色时应用暗色外观与Chromium偏好可能不同。

但只同步nativeTheme仍不足以解释并修复全部情况：本机系统本身已偏好暗色，默认网页滚动条仍可为白色。Chrome还按浏览器工具栏主题计算独立的`preferred_root_scrollbar_color_scheme`；当前Electron版本同步网页偏好时未同步该字段，保留浅色默认值。

Blink对默认`color-scheme:normal`的顶层非覆盖式滚动条采用独立判定：网页偏好与根滚动条偏好都为暗色才使用暗色原生绘制。这个机制使Chrome Just Black能够保留浅色网页背景，同时显示暗色根滚动条。最初“nativeTheme暗色仍白色，所以需要网站CSS”的判断不充分，已通过源码与实验修正；未加入Bilibili滚动条CSS补丁。

依据：

- [Electron nativeTheme文档](https://www.electronjs.org/docs/latest/api/native-theme)：偏好传播与原生界面行为。
- [Electron v45.2.1实现](https://raw.githubusercontent.com/electron/electron/v45.2.1/shell/browser/electron_browser_client.cc)：颜色相关WebPreferences更新。
- [Chrome浏览器主题实现](https://chromium.googlesource.com/chromium/src.git/+/0040e78d53bdbdc122591bf565c5e5d3f4b2467d/chrome/browser/chrome_content_browser_client.cc)：根滚动条偏好来源。
- [Blink根滚动条绘制判定](https://chromium.googlesource.com/chromium/src/+/adc0b917f1415d7a64f4921db53dd2b25b99b7fd/third_party/blink/renderer/core/paint/paint_layer_scrollable_area.cc)。
- [PreferredColorScheme枚举](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/public/mojom/css/preferred_color_scheme.mojom)：`kDark`对应0。

## 最小修复

`electron/NativeTheme.ts`集中处理两件事：

1. 渲染器创建前通过Chromium原生`blink-settings`补足`preferredRootScrollbarColorScheme=0`，保留其他已有Blink参数。该暗色提示只在网页偏好为暗色且网页未主动选择另一配色方案时参与判定，不是强制网页暗色。
2. 深蓝、深灰、纯黑映射到`nativeTheme.themeSource='dark'`。启动读取配置后、主窗口创建前应用；设置保存时即时同步。值未变化时不重复通知。未来浅色偏好的映射为`light`，此时上述双重条件不成立，默认滚动条可以即时回到浅色；当前UI仍只有三种暗色主题。

调用点仅在`electron/main.ts`初始化和`electron/SettingsService.ts`偏好应用。不增加设置，不变更配置结构，不修改BrowserManager布局、缩放、交换、焦点和音频逻辑。不注入网页滚动条CSS，不使用强制暗色或自制滚动条组件。

这是已在当前Electron/Chromium版本实测的原生内部设置；升级内核时应重跑像素矩阵，若Electron将来公开对应偏好接口应优先改用公开接口。

## 验证

`node scripts/scrollbar-smoke.mjs`使用临时userData、静音且保持可见的诊断窗口，避免遮挡/后台节流导致旧帧。8种页面分别进行浅色→深蓝→深灰→纯黑→浅色，共40项；真实Bilibili视频增加5项，最终45项通过。浅色仅用于验证底层映射，并非新增UI主题。

| 场景 | 暗色偏好下结果 |
| --- | --- |
| 默认normal网页 | 修复前轨道RGB(252,252,252)，修复后三主题均RGB(44,44,44) |
| 支持light dark网页 | 三主题使用暗色原生滚动条，切回浅色可恢复 |
| 网页明确color-scheme:light | 保留浅色，尊重网站声明 |
| WebKit伪元素自定义滚动条 | 原18px宽度及黄轨道/紫滑块保持 |
| 标准scrollbar-color自定义 | 网站颜色保持 |
| Shadow DOM自动配色 | 继承后的原生滚动条为暗色 |
| 跨源iframe自动配色 | 正常跟随可用暗色方案 |
| 父页面明确把iframe设为浅色 | iframe内继续浅色，外部根滚动条暗色 |

默认原生宽度始终15 CSS px（420px视图、clientWidth405），未重定义宽度、圆角或滑块。原生拖动与滚轮均有效；主题切换阶段滚动位置保持240、JS实例标记不变、视频持续播放、页面固定背景未改变。模拟手势的惯性结束后才开始下一轮偏好比较，未在产品中加入等待。

真实测试页面为`BV1m7WB6mEuM`：三暗色主题根轨道均为RGB(44,44,44)，网页背景仍RGB(241,242,243)，`color-scheme`仍normal，clientWidth405、scrollY240，所有采样均未暂停视频。切回浅色偏好后轨道恢复RGB(252,252,252)。已核对实际截图中的纵向和横向原生滚动条。

61项单测、类型/生产构建、格式检查通过。真实设置专项验证从浅色原生偏好启动后正确同步为暗色、三主题无需重载网页的偏好更新、网页实例/缩放/音量/焦点保留及本地界面配色；最终完整设置专项与六种交换焦点回归通过。

早期诊断曾因父渲染器未初始化、窗口被遮挡、后台帧暂停、合成输入没有选中预期窗口及控件未聚焦而出现失败。最终夹具初始化父页面并保持可见，明确选择被测窗口与输入控件后运行；没有修改产品焦点或加入强制重绘来让测试通过。测试工具使用有界等待并保留首次像素/最终像素，实际API调用不视为已重绘。

## 边界与记录

网站显式浅色方案、自定义滚动条、iframe自身或继承的配色仍由网站和Chromium管理。根滚动条机制不意味着强行统一所有页面内部滚动容器；不能把已验证站点与夹具推广为全部第三方网页。应用设置页及菜单等本地区域继续使用既有三主题样式与暗色color-scheme。

本轮未改动之前的Bilibili合集排版兼容规则。网页可主动响应`prefers-color-scheme:dark`改变自己的样式，这是网站行为；应用没有强制改写整页配色。原始数字结果保留于被Git忽略的`scrollbar-diagnostic.json`，截图为`scrollbar-*-smoke.png`；不提交用户日志、浏览器配置或凭据。
