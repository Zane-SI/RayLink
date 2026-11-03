import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RayLinkStore } from "../server/database.js";

test("opening a database protects existing and newly created SQLite files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "raylink-db-permissions-"));
  const dbPath = join(directory, "store.db");
  const options = { dbPath, adminUsername: "admin", adminPassword: "test-password-123", seedDemoData: false };
  let store;
  t.after(async () => { store?.close(); await rm(directory, { recursive: true, force: true }); });
  store = new RayLinkStore(options);
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  for (const path of files) assert.equal((await stat(path)).mode & 0o777, 0o600);
  store.close(); store = null;
  await chmod(dbPath, 0o644);
  store = new RayLinkStore(options);
  for (const path of files) assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal(store.routingPolicy().mode, "smart");
});
