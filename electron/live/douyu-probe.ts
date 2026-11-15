import { resolve } from "node:path";
import { DouyuAdapter } from "./Douyu";
import { nativeDouyuQuery } from "./DouyuNative";
const ids = process.argv.slice(2);
const inputs = ids.length ? ids : ["9999", "288016", "99999999999999999999"];
const transport = nativeDouyuQuery(resolve("dist-native/LiveStatus.exe"));
let requests = 0;
const started = performance.now();
const adapter = new DouyuAdapter(async (id, signal) => {
  const at = performance.now();
  requests++;
  const response = await transport(id, signal);
  console.log(
    JSON.stringify({
      requestMs: Math.round(performance.now() - at),
      httpStatus: response.httpStatus,
      error: response.error ?? null,
    }),
  );
  return response;
});
async function main() {
  const results = await adapter.queryMany(inputs, {
    onResult: (result) =>
      console.log(
        JSON.stringify({
          room: result.inputRoomId,
          realRoom: result.realRoomId,
          status: result.status,
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
