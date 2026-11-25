import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createRayLinkApp } from "../server/app.js";

async function startTestApp(overrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "raylink-user-delete-"));
  const app = await createRayLinkApp({
    dataDir,
    adminUsername: "admin",
    adminPassword: "{{SECRET_yhfbjm0m}}",
    publicOrigin: "http://127.0.0.1",
    runtimeMode: "dry-run",
    seedDemoData: false,
    ...overrides
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  return {
    app,
    dataDir,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  };
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "{{SECRET_yhfbjm0m}}" })
  });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie()[0].split(";")[0];
}

async function api(baseUrl, cookie, path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      cookie,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers
    }
  });
}

test("admin deletes a user, removes portal sessions, and republishes runtime credentials", async (t) => {
  const publications = [];
  const runtimeAdapter = {
    async publish(publication) {
      publications.push(publication);
      return { state: "running", mode: "test", runtimeVersion: "1.14.2" };
    },
    async status() {
      return { state: "running", mode: "test", runtimeVersion: "1.14.2" };
    }
  };
  const testApp = await startTestApp({ runtimeAdapter });
  t.after(() => testApp.close());
  const cookie = await login(testApp.baseUrl);

  const createResponse = await api(testApp.baseUrl, cookie, "/api/users", {
    method: "POST",
    body: JSON.stringify({
      name: "Delete Me",
      email: "delete-me@example.test",
      password: "{{SECRET_yhfbjm0m}}",
      portalStatus: "active",
      quotaGb: 40,
      nodeScope: ["all"],
      expiresAt: "2099-12-31"
    })
  });
  assert.equal(createResponse.status, 201);
  const user = await createResponse.json();
  await api(testApp.baseUrl, cookie, "/api/deployments", { method: "POST" });
  assert.equal(publications.length, 1);
  publications.length = 0;

  const loginResponse = await fetch(`${testApp.baseUrl}/api/portal/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "delete-me@example.test", password: "{{SECRET_yhfbjm0m}}" })
  });
  assert.equal(loginResponse.status, 200);
  const portalCookie = loginResponse.headers.getSetCookie()[0].split(";")[0];

  const deleteResponse = await api(
    testApp.baseUrl,
    cookie,
    `/api/users/${encodeURIComponent(user.id)}`,
    { method: "DELETE" }
  );
  assert.equal(deleteResponse.status, 200);
  const deleted = await deleteResponse.json();
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.runtimeSync.status, "published");
  assert.equal(publications.length, 1);
  assert.doesNotMatch(publications[0].configText, /delete-me@example\.test/);

  const portalAfter = await api(testApp.baseUrl, portalCookie, "/api/portal/bootstrap");
  assert.equal(portalAfter.status, 401);

  const bootstrap = await api(testApp.baseUrl, cookie, "/api/bootstrap");
  const snapshot = await bootstrap.json();
  assert.equal(snapshot.users.some((item) => item.id === user.id), false);
});

test("deleting an unknown user returns a safe not-found error", async (t) => {
  const testApp = await startTestApp();
  t.after(() => testApp.close());
  const cookie = await login(testApp.baseUrl);

  const response = await api(testApp.baseUrl, cookie, "/api/users/missing-user", {
    method: "DELETE"
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "USER_NOT_FOUND");
});
