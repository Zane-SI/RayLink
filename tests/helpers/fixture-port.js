import { once } from "node:events";
import { createServer } from "node:net";

export function createFixturePortAllocator() {
  const allocated = new Set();
  return async function unusedPort() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const server = createServer();
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const port = server.address().port;
      await new Promise((resolve) => server.close(resolve));
      // A released ephemeral port may be returned again before the Runtime
      // binds its complete set of TCP and UDP fixture listeners.
      if (allocated.has(port)) continue;
      allocated.add(port);
      return port;
    }
    throw new Error("Could not allocate a distinct fixture port after 100 attempts");
  };
}
