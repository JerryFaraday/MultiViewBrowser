import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const request = (kind, ids) =>
  new Promise((resolve, reject) => {
    const p = spawn("dist-native/LiveStatus.exe", [kind, ids], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let text = "";
    const timer = setTimeout(() => {
      p.kill();
      reject(Error("Native request timed out"));
    }, 15000);
    p.stdout.on("data", (b) => (text += b));
    p.on("error", reject);
    p.on("close", (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw Error("Native query failed");
        const r = JSON.parse(text);
        if (r.code !== 0 || !r.data) throw Error("API unavailable");
        resolve(r.data);
      } catch (e) {
        reject(e);
      }
    });
  });
try {
  const started = performance.now();
  const direct = await request("rooms", "35,22637261");
  const directMs = Math.round(performance.now() - started);
  const directValid = ["35", "22637261"].every((id) =>
    Object.entries(direct).some(
      ([key, r]) =>
        String(r.roomid) === key &&
        (key === id || String(r.short_id) === id) &&
        Number.isSafeInteger(r.uid) &&
        Number.isInteger(r.live_status),
    ),
  );
  const rooms = await Promise.all(
    ["35", "22637261"].map((id) => request("room", id)),
  );
  const uids = [...new Set(rooms.map((r) => String(r.uid)))];
  if (
    rooms.some(
      (r) => !Number.isSafeInteger(r.uid) || !Number.isInteger(r.live_status),
    )
  )
    throw Error("Unexpected room response");
  const states = await request("uids", uids.join(","));
  const pass =
    directValid &&
    uids.every(
      (uid) =>
        String(states[uid]?.uid) === uid &&
        Number.isInteger(states[uid]?.live_status),
    );
  const result = {
    directMembers: Object.keys(direct).length,
    directMs,
    roomResolution: rooms.length,
    batchMembers: Object.keys(states).length,
    pass,
  };
  writeFileSync("live-native-diagnostic.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  process.exit(pass ? 0 : 1);
} catch {
  console.error(
    "Native/API verification failed; inspect network and rebuild helper.",
  );
  process.exit(1);
}
