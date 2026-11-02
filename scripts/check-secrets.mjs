import { execFileSync } from "node:child_process";
const paths = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  ],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["service-token", /\b(?:sk-proj-|sk_live_|xox[baprs]-)[A-Za-z0-9_-]{20,}\b/],
  ["credential-url", /https?:\/\/[^\s/@:]+:[^\s/@]+@/],
  [
    "assigned-secret",
    /(?:password|client_secret|api_key|access_token)\s*[:=]\s*["'][A-Za-z0-9_+/=-]{16,}["']/i,
  ],
];
let count = 0;
for (const path of paths) {
  if (
    /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx|keystore|jks)$/i.test(path) &&
    !/\.example$/.test(path)
  ) {
    console.error(`${path}: sensitive-file`);
    count++;
  }
  const data = execFileSync("git", ["show", ":" + path], {
    maxBuffer: 20 * 1024 * 1024,
  });
  if (data.includes(0)) {
    console.error(`${path}: binary-review-required`);
    count++;
    continue;
  }
  for (const [name, pattern] of rules)
    if (pattern.test(data.toString("utf8"))) {
      console.error(`${path}: ${name}`);
      count++;
    }
}
console.log(`Scanned ${paths.length} staged files; findings: ${count}`);
process.exitCode = count ? 1 : 0;
