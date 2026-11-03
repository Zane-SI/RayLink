import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = new URL("../.github/scripts/check-required-jobs.mjs", import.meta.url);
const success = { runtime: { result: "success" }, "production-check": { result: "success" }, "installation-check": { result: "success" } };
const run = (input) => spawnSync(process.execPath, [gate.pathname], {
  env: { ...process.env, RAYLINK_REQUIRED_JOB_RESULTS: typeof input === "string" ? input : JSON.stringify(input) }, encoding: "utf8"
});

test("the stable CI gate passes only after every required job succeeds", () => {
  assert.equal(run(success).status, 0);
  for (const job of Object.keys(success)) {
    for (const result of ["failure", "cancelled", "skipped", "pending", null]) {
      const state = structuredClone(success); state[job].result = result;
      assert.notEqual(run(state).status, 0, `${job}=${result} must block merging`);
    }
  }
});

test("missing, unexpected or malformed dependency results fail closed", () => {
  const missing = structuredClone(success); delete missing["production-check"];
  for (const value of [missing, {}, [], null, "not-json", { ...success, extra: { result: "success" } }]) {
    assert.notEqual(run(value).status, 0);
  }
});

test("the workflow always reports the same merge gate after all required job families", () => {
  const workflow = readFileSync(new URL("../.github/workflows/raylink-production-check.yml", import.meta.url), "utf8");
  const job = workflow.split("\n  required-checks:\n")[1];
  assert.ok(job, "Missing stable aggregation job");
  assert.match(job, /name: RayLink CI/);
  assert.match(job, /if: \$\{\{ always\(\) \}\}/);
  assert.match(job, /needs: \[runtime, production-check, installation-check\]/);
  assert.match(job, /RAYLINK_REQUIRED_JOB_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(job, /node \.github\/scripts\/check-required-jobs\.mjs/);
});
