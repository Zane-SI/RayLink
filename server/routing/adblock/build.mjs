import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const SOURCE_COMMIT = "aa5fd1b1ef00e4582ef255949469f12f746f3183";
const SOURCE_URL = `https://raw.githubusercontent.com/Johnshall/Shadowrocket-ADBlock-Rules-Forever/${SOURCE_COMMIT}/sr_ad_only.conf`;
const SOURCE_SHA256 = "1eda2b7be2a11b1fffd31641a7d3abb353ac1c05289b2e935165339837f3a95c";
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function artifact(path, bytes) {
  return { filename: basename(path), bytes: bytes.length, sha256: digest(bytes) };
}

function parseSource(source) {
  const domains = new Set();
  const ipCidrs = new Set();
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";") || line === "[Rule]") continue;
    const [kind, rawValue, action, ...extra] = line.split(",").map((value) => value.trim());
    if (extra.length || !rawValue || !action || action.toLowerCase() !== "reject") {
      throw new Error(`Unsupported upstream rule at line ${index + 1}`);
    }
    if (kind === "DOMAIN-SUFFIX") {
      const domain = rawValue.toLowerCase().replace(/\.$/, "");
      if (!DOMAIN_PATTERN.test(domain)) throw new Error(`Invalid upstream domain at line ${index + 1}`);
      domains.add(domain);
    } else if (kind === "IP-CIDR") {
      ipCidrs.add(rawValue);
    } else {
      throw new Error(`Unsupported upstream rule type ${kind} at line ${index + 1}`);
    }
  }
  return { domains: [...domains].sort(), ipCidrs: [...ipCidrs].sort() };
}

const [outputArgument] = process.argv.slice(2);
if (!outputArgument) throw new Error("Usage: node server/routing/adblock/build.mjs NEW_OUTPUT_DIRECTORY");
const output = resolve(outputArgument);
await mkdir(output, { recursive: false });

const response = await fetch(SOURCE_URL, {
  signal: AbortSignal.timeout(30_000),
  headers: { "user-agent": "RayLink ad-block rule builder" }
});
if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
const sourceBytes = Buffer.from(await response.arrayBuffer());
if (digest(sourceBytes) !== SOURCE_SHA256) throw new Error("Upstream ad-block source checksum mismatch");
const { domains, ipCidrs } = parseSource(sourceBytes.toString("utf8"));
if (domains.length !== 58_417 || ipCidrs.length !== 128) {
  throw new Error(`Unexpected reviewed rule counts: ${domains.length} domains, ${ipCidrs.length} IP ranges`);
}

const jsonPath = join(output, "adblock-johnshall.json");
const srsPath = join(output, "adblock-johnshall.srs");
const mihomoTextPath = join(output, "adblock-johnshall-mihomo.txt");
const mrsPath = join(output, "adblock-johnshall.mrs");
const egernPath = join(output, "adblock-johnshall-egern.yaml");
const jsonBytes = Buffer.from(`${JSON.stringify({ version: 1, rules: [{ domain_suffix: domains }] })}\n`);
const mihomoBytes = Buffer.from(`${domains.map((domain) => `+.${domain}`).join("\n")}\n`);
const egernBytes = Buffer.from(`no_resolve: true\ndomain_set:\n${domains.map((domain) => `  - ${domain}`).join("\n")}\n`);
await writeFile(jsonPath, jsonBytes, { mode: 0o644 });
await writeFile(mihomoTextPath, mihomoBytes, { mode: 0o644 });
await writeFile(egernPath, egernBytes, { mode: 0o644 });

const singBox = process.env.SING_BOX_BIN || "sing-box";
const mihomo = process.env.MIHOMO_BIN || "mihomo";
await execFile(singBox, ["rule-set", "compile", jsonPath, "-o", srsPath], { timeout: 30_000 });
await execFile(mihomo, ["convert-ruleset", "domain", "text", mihomoTextPath, mrsPath], { timeout: 30_000 });

const [srsBytes, mrsBytes] = await Promise.all([
  readFile(srsPath),
  readFile(mrsPath)
]);
const manifest = {
  schemaVersion: 1,
  version: `johnshall-${SOURCE_COMMIT.slice(0, 12)}`,
  publishedAt: "2026-10-17T23:03:41Z",
  description: "Reviewed domain-only adaptation of Shadowrocket-ADBlock-Rules-Forever sr_ad_only.conf; upstream IP ranges are intentionally excluded to reduce shared-address false positives.",
  source: {
    repository: "https://github.com/Johnshall/Shadowrocket-ADBlock-Rules-Forever",
    commit: SOURCE_COMMIT,
    url: SOURCE_URL,
    sha256: SOURCE_SHA256,
    bytes: sourceBytes.length,
    license: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/"
  },
  statistics: {
    domainSuffixes: domains.length,
    excludedIpCidrRules: ipCidrs.length,
    excludedNormalizedIpCidrs: 125
  },
  artifacts: [
    artifact(jsonPath, jsonBytes),
    artifact(srsPath, srsBytes),
    artifact(mrsPath, mrsBytes),
    artifact(egernPath, egernBytes)
  ]
};
await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
process.stdout.write(`Built ${manifest.version}: ${domains.length} domain suffixes; excluded ${ipCidrs.length} IP rules.\n`);
