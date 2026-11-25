import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// Authorized browser-handler seam: real shipped handler, DOM/HTTP boundaries only.
const source = await readFile(new URL("../web/app.js", import.meta.url), "utf8");

function handler(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `Missing shipped handler ${name}`);
  const end = source.indexOf("\nfunction ", start + 1);
  const asyncEnd = source.indexOf("\nasync function ", start + 1);
  return source.slice(start, Math.min(...[end, asyncEnd].filter((index) => index > start)));
}

test("a cancelled user deletion does not call the API", async () => {
  const calls = [];
  const context = {
    api: async (...args) => calls.push(args),
    loadBootstrap: async () => {},
    closeDrawer: () => {},
    showToast: () => {},
    users: [],
    window: { confirm: () => false }
  };
  vm.runInNewContext(handler("deleteUserButton"), context);
  const button = { dataset: { userDelete: "user-1" }, textContent: "删除用户", disabled: false, closest: () => null };
  await context.deleteUserButton(button);
  assert.deepEqual(calls, []);
  assert.equal(button.textContent, "删除用户");
  assert.equal(button.disabled, false);
});

test("confirmed user deletion refreshes bootstrap, closes the drawer and reports publication", async () => {
  const calls = [];
  let closed = false;
  const toasts = [];
  const context = {
    api: async (path, options) => {
      calls.push({ path, method: options.method });
      return { deleted: true, runtimeSync: { status: "published" } };
    },
    loadBootstrap: async () => calls.push({ path: "bootstrap", method: "GET" }),
    closeDrawer: () => { closed = true; },
    showToast: (...args) => toasts.push(args),
    users: [{ id: "user-1", name: "Test User", email: "test@example.test" }],
    window: { confirm: () => true }
  };
  vm.runInNewContext(handler("deleteUserButton"), context);
  const button = { dataset: { userDelete: "user-1" }, textContent: "删除用户", disabled: false, closest: () => ({ isConnected: true }) };
  await context.deleteUserButton(button);
  assert.deepEqual(calls, [
    { path: "/api/users/user-1", method: "DELETE" },
    { path: "bootstrap", method: "GET" }
  ]);
  assert.equal(closed, true);
  assert.equal(toasts[0][0], "用户已删除");
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "删除用户");
});

test("a failed user deletion leaves the confirm button available", async () => {
  const toasts = [];
  const context = {
    api: async () => { throw new Error("runtime rejected deletion"); },
    loadBootstrap: async () => {},
    closeDrawer: () => {},
    showToast: (...args) => toasts.push(args),
    users: [{ id: "user-1", name: "Test User", email: "test@example.test" }],
    window: { confirm: () => true }
  };
  vm.runInNewContext(handler("deleteUserButton"), context);
  const button = { dataset: { userDelete: "user-1" }, textContent: "删除用户", disabled: false, closest: () => ({ isConnected: true }) };
  await context.deleteUserButton(button);
  assert.match(toasts[0][0], /失败/);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "删除用户");
});
