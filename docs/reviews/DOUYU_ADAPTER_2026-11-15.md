# 斗鱼直播状态底层适配器

日期：2026-11-15；版本：V0.2.3.0。新增底层功能，未接入设置、收藏类别、指示灯、自动轮询或配置缓存。现有B站监测器及配置结构未修改。

## 接口与状态

仅使用`GET https://www.douyu.com/betard/{roomId}`，以`room.room_id`提供真实房号，读取`room.show_status`和`room.videoLoop`。数值0/1及对应字符串可识别，布尔值、缺失或其他值保守返回UNKNOWN。字段完整时，show_status=0为OFFLINE；show_status=1、videoLoop=0为LIVE；show_status=1、videoLoop=1为LOOP。轮播绝不折算为LIVE，网络失败不折算为OFFLINE。

未接入RoomApi备用接口，避免无法确认轮播时错误给出LIVE。实际采样288016得到show_status=2，因此返回UNKNOWN，不能依据推测将2改判为未播。无效/不存在房号可能返回非JSON或其他异常响应，仍为UNKNOWN。

## 调用

```ts
import { DouyuAdapter } from "../../electron/live/Douyu";
import { nativeDouyuQuery } from "../../electron/live/DouyuNative";

// executable 为项目构建输出或发布资源中的 LiveStatus.exe 绝对路径。
const adapter = new DouyuAdapter(nativeDouyuQuery(executable));
const controller = new AbortController();
const one = await adapter.query("9999", { signal: controller.signal });
const results = await adapter.queryMany(["9999", "9999", "288016"], {
  signal: controller.signal,
  onResult: result => { /* 每个去重房号完成时收到结果，无需等待整轮 */ },
});
```

返回包含`platform: "douyu"`、`inputRoomId`、`status`；可靠响应可增加`realRoomId`，异常包含`reason`，HTTP失败可包含`httpStatus`。结果数组与输入顺序/数量一致，重复项共享网络任务、返回独立结果副本；onResult每个去重输入调用一次。房号限1–20位正整数，去掉前导零。结果仅提供映射，不写任何配置，后续可由统一调度器选择保存到各收藏。

默认最多3个并发请求，所有调用共享至少250ms的请求起始间隔；同轮重复房号只启动一个逻辑查询（可按重试策略再请求）。429、500/502/503/504、网络失败和超时最多重试2次，退避500/1000ms，退避不占并发槽。单次适配器请求最多14秒，C++阶段超时5秒、总体等待12秒；队列等待不计入单次网络超时。AbortSignal取消排队、退避及在途子进程，整轮以AbortError拒绝，取消后的结果不再发布；调用方开启替代轮次时应取消旧轮次。构造适配器不会发请求或建立周期定时器。

C++新增固定主机/路径的douyu命令，复用原有异步WinHTTP回调、长度上限、禁止重定向及关闭生命周期。仅新命令使用“HTTP/错误元数据JSON行 + 原始响应体”协议。B站命令的stdout和退出码协议不变。开发入口显式打包适配器，应用主入口未导入它，因此不会隐式激活检测。

## 验证

- `node .npm-tools/bin/npm-cli.js test`：197项通过，其中新增59项斗鱼测试。覆盖LIVE、OFFLINE、LOOP、未知字段、房号校验、多调用并发/起始间隔、重复去重、超时、网络恢复、429/临时5xx有限重试、404、取消排队/在途/退避、过期结果丢弃、原生协议/UTF8/输出限制及工作进程终止。
- 类型/生产构建、格式检查通过。没有新增依赖，也未修改任何设置/收藏UI或配置格式。
- 开发实际入口：先构建，再运行`node scripts/douyu-smoke.mjs`，可在后面传多个纯数字房号。使用独立C++进程，不打开网页，不使用用户Cookie或会话。
- 首轮C++实际采样：9999为LIVE、156ms；288016为UNKNOWN（状态2）、382ms；20位无效房号异常为UNKNOWN、189ms。3个请求总计711ms，含默认起始间隔。网络耗时仅为本次样本。
- 共享助手的B站真实主查询及原有room_init/UID备用验证通过，B站收藏/检测UI专项通过。没有改变其检测路径、设置或调度。

限制：真实采样未确认一个当前show_status=0的未播房间或videoLoop=1的轮播房间，二者解析通过模拟响应验证，不能等同真实服务全覆盖。异常/429/超时/取消用受控测试验证，不对真实服务制造限流。第三方接口可变化、限流或返回反爬页面；不尝试绕过限制、不使用不可靠备用信息猜测状态。当前请求限制按适配器实例共享，后续统一调度应复用同一实例。仅Windows x64原生助手已有构建链被验证。
