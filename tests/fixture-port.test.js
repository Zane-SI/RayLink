import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, Server } from "node:net";
import test from "node:test";
import { createFixturePortAllocator } from "./helpers/fixture-port.js";

test("native fixtures can bind both listeners when the OS reuses a released port", async (t) => {
  const original = Server.prototype.listen;
  let releasedPort;
  let replayed = false;
  const listen = t.mock.method(Server.prototype, "listen", function (...args) {
    if (args[0] === 0) {
      if (releasedPort && !replayed) {
        args[0] = releasedPort;
        replayed = true;
      }
      this.once("listening", () => { releasedPort = this.address().port; });
    }
    return original.apply(this, args);
  });
  const unusedPort = createFixturePortAllocator();
  const first = await unusedPort();
  const second = await unusedPort();
  listen.mock.restore();
  assert.ok(replayed, "The OS port reuse control must run");
  const listeners = [createServer(), createServer()];
  t.after(async () => {
    await Promise.all(listeners.filter((server) => server.listening).map((server) => new Promise((resolve) => server.close(resolve))));
  });
  for (const [index, server] of listeners.entries()) {
    server.listen([first, second][index], "127.0.0.1");
    await once(server, "listening");
  }
});
