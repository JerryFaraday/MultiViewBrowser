import { resolve } from "node:path";
import { DouyuAdapter } from "./Douyu";
import { nativeDouyuQuery } from "./DouyuNative";
const ids = process.argv.slice(2);
const inputs = ids.length ? ids : ["6657", "1667826"];
let requests = 0;
const started = performance.now();
const starts = new Map<string, number>();
const tracked = (api: "betard" | "room-api") => {
  const transport = nativeDouyuQuery(
    resolve("dist-native/LiveStatus.exe"),
    api,
  );
  return async (id: string, signal: AbortSignal) => {
    const at = performance.now();
    if (!starts.has(id)) starts.set(id, at);
    requests++;
    const response = await transport(id, signal);
    console.log(
      JSON.stringify({
        room: id,
        api,
        requestMs: Math.round(performance.now() - at),
        httpStatus: response.httpStatus,
        error: response.error ?? null,
      }),
    );
    return response;
  };
};
const adapter = new DouyuAdapter(tracked("betard"), {}, tracked("room-api"));
async function main() {
  const results = await adapter.queryMany(inputs, {
    onResult: (result) =>
      console.log(
        JSON.stringify({
          room: result.inputRoomId,
          realRoom: result.realRoomId,
          status: result.status,
          source: result.source,
          queryMs: Math.round(
            performance.now() - (starts.get(result.inputRoomId) ?? started),
          ),
          reason: result.reason ?? null,
          httpStatus: result.httpStatus,
        }),
      ),
  });
  console.log(
    JSON.stringify({
      rooms: inputs.length,
      requests,
      totalMs: Math.round(performance.now() - started),
      confirmed: results.filter((r) => r.status !== "UNKNOWN").length,
    }),
  );
  if (!results.some((r) => r.realRoomId)) process.exitCode = 1;
}
main().catch(() => {
  console.error("Douyu probe failed");
  process.exitCode = 1;
});
