import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url)));
const artifacts = new Map(manifest.artifacts.map((artifact) => [artifact.filename, artifact]));
const allowedFiles = new Set([
  "adblock-johnshall.srs",
  "adblock-johnshall.mrs",
  "adblock-johnshall-egern.yaml"
]);

function readVerified(filename) {
  const expected = artifacts.get(filename);
  if (!expected) throw new Error(`Unknown bundled ad-block artifact: ${filename}`);
  const bytes = readFileSync(new URL(filename, import.meta.url));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== expected.bytes || actual !== expected.sha256) {
    throw new Error(`Bundled ad-block checksum mismatch: ${filename}`);
  }
  return bytes;
}

const source = JSON.parse(readVerified("adblock-johnshall.json"));
const domains = source.rules?.flatMap((rule) => rule.domain_suffix || []) || [];
if (domains.length !== manifest.statistics.domainSuffixes) throw new Error("Bundled ad-block domain count mismatch");
Object.freeze(domains);

const servedArtifacts = new Map([...allowedFiles].map((filename) => [filename, readVerified(filename)]));

export function getBundledAdblockDomains() {
  return domains;
}

export function getBundledAdblockArtifact(filename) {
  const bytes = servedArtifacts.get(filename);
  return bytes ? Buffer.from(bytes) : null;
}

export function getBundledAdblockVersion() {
  return manifest.version;
}
