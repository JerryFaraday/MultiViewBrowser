import type { WebContents } from "electron";
export async function within<T>(
  label: string,
  work: Promise<T>,
  milliseconds = 3000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("smoke timeout: " + label)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
/** Test-only stage tracing, never installed in product windows. */
export function traceScripts(wc: WebContents, label: string) {
  const original = wc.executeJavaScript.bind(wc);
  let sequence = 0;
  wc.executeJavaScript = <T>(code: string, gesture?: boolean) => {
    const stage =
      label +
      ":" +
      ++sequence +
      (code.includes("exitFullscreen")
        ? ":exit-fullscreen"
        : code.includes("requestFullscreen")
          ? ":enter-fullscreen"
          : ":script");
    console.log("stage", stage);
    return within<T>(stage, original(code, gesture) as Promise<T>);
  };
}

export async function exitHtml(wc: WebContents) {
  wc.focus();
  await within(
    "exit-request",
    wc.executeJavaScript(
      "if(document.fullscreenElement)void document.exitFullscreen();true",
      true,
    ),
  );
  await until(
    "exit-state",
    async () => !(await wc.executeJavaScript("!!document.fullscreenElement")),
  );
}

export async function focusForInput(wc: WebContents) {
  if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
  await wc.debugger.sendCommand("Emulation.setFocusEmulationEnabled", {
    enabled: true,
  });
}

export async function until(
  label: string,
  read: () => Promise<boolean>,
  milliseconds = 2000,
) {
  const end = Date.now() + milliseconds;
  do {
    if (await within(label, read(), Math.min(1000, milliseconds))) return;
    await new Promise((r) => setTimeout(r, 25));
  } while (Date.now() < end);
  throw Error("smoke condition timeout: " + label);
}
