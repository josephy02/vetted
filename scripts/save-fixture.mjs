#!/usr/bin/env node
// Captures a live screening into public/fixtures/ for ?demo=cached replay.
// Usage: npm run fixture -- "CDK Global" --domain cdkglobal.com --state IL
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const companyName = args.find((a) => !a.startsWith("--"));
if (!companyName) {
  console.error('Usage: npm run fixture -- "Company Name" [--domain x.com] [--city X] [--state XX]');
  process.exit(1);
}

const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const base = flag("url") ?? "http://localhost:3000";
const body = {
  companyName,
  ...(flag("domain") ? { domain: flag("domain") } : {}),
  ...(flag("city") ? { city: flag("city") } : {}),
  ...(flag("state") ? { state: flag("state") } : {}),
};

const dir = path.join(process.cwd(), "public", "fixtures");
await mkdir(dir, { recursive: true });

console.log(`Screening ${companyName}...`);
const res = await fetch(`${base}/api/screen`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`Request failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}

let result;
let buffer = "";
for await (const chunk of res.body) {
  buffer += new TextDecoder().decode(chunk);
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "step") console.log(`  ${event.step}: ${event.status} (${event.ms}ms)`);
    if (event.type === "result") result = event.data;
    if (event.type === "error") {
      console.error(`  error: ${event.message}`);
      process.exit(1);
    }
  }
}

if (!result) {
  console.error("Stream ended without a result.");
  process.exit(1);
}
if (result.warnings?.length) {
  console.warn("Saved with warnings:", result.warnings);
}

const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const file = `${slug}.json`;
const savedAt = new Date().toISOString();
await writeFile(path.join(dir, file), JSON.stringify({ savedAt, result }, null, 2));

const indexPath = path.join(dir, "index.json");
const index = JSON.parse(await readFile(indexPath, "utf8").catch(() => "[]"));
const entry = { companyName, domain: body.domain ?? null, file, savedAt };
const next = [...index.filter((e) => e.file !== file), entry].sort((a, b) =>
  a.companyName.localeCompare(b.companyName),
);
await writeFile(indexPath, JSON.stringify(next, null, 2));

console.log(
  `Saved ${file} — ${result.findings.length} findings, ${result.sources.length} sources, ` +
    `${(result.timings.totalMs / 1000).toFixed(1)}s`,
);
