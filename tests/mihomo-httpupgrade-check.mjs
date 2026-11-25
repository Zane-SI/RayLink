import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { buildSingBoxConfig } from "../server/singbox/config.js";
import { buildProtocolClientConfig, defaultProtocolConfigs, normalizeProtocolConfig } from "../server/singbox/protocol-catalog.js";
import { buildSubscriptionArtifact } from "../server/subscriptions/formats.js";

const run = promisify(execFile);
const singBox = process.env.SING_BOX_BIN || "sing-box";
const mihomo = process.env.MIHOMO_BIN || "mihomo";
const directory = await mkdtemp(join(tmpdir(), "raylink-httpupgrade-"));
const children = [];
const allocatedPorts = new Set();
const origin = createServer((_request, response) => response.end("httpupgrade-fixture"));
const credential = {
  email: "upgrade-fixture@example.invalid", runtimeUuid: "3365c019-4b70-4dd5-9b3a-48d83a22f24d",
  runtimePassword: "fixture", serverPassword: "AAAAAAAAAAAAAAAAAAAAAA=="
};

async function unusedPort() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const tcp = createTcpServer();
    tcp.listen(0, "127.0.0.1");
    await once(tcp, "listening");
    const port = tcp.address().port;
    const udp = createSocket({ type: "udp4" });
    try {
      udp.bind(port, "127.0.0.1");
      await once(udp, "listening");
    } catch {
      try { udp.close(); } catch {}
      await new Promise(resolve => tcp.close(resolve));
      continue;
    }
    udp.close();
    await new Promise(resolve => tcp.close(resolve));
    if (allocatedPorts.has(port)) continue;
    allocatedPorts.add(port);
    return port;
  }
  throw new Error("could not reserve a loopback port for both TCP and UDP");
}

class PortConflictError extends Error {}

function hasMixedPortConflict(logs, port) {
  return new RegExp(`level=error msg="Start Mixed\\(http\\+socks\\) server error: listen (?:tcp|udp) 127\\.0\\.0\\.1:${port}: bind: address already in use"`).test(logs);
}

async function stopOnPortConflict(child, name, readLogs, mixedPort) {
  if (!mixedPort || !hasMixedPortConflict(readLogs(), mixedPort)) return;
  await stop(child);
  throw new PortConflictError(`${name} mixed-port conflict:\n${readLogs()}`);
}

async function launch(binary, args, marker, name, mixedPort) {
  const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let logs = "";
  child.stdout.on("data", data => { logs = (logs + data).slice(-32768); });
  child.stderr.on("data", data => { logs = (logs + data).slice(-32768); });
  const readLogs = () => logs;
  for (let attempt = 0; attempt < 200 && child.exitCode === null; attempt++) {
    await stopOnPortConflict(child, name, readLogs, mixedPort);
    if (logs.includes(marker)) {
      // The listening marker can precede listener errors. Wait briefly so a
      // mixed HTTP/SOCKS UDP bind failure cannot become an HTTPUpgrade failure.
      await delay(100);
      await stopOnPortConflict(child, name, readLogs, mixedPort);
      return { child, readLogs };
    }
    await delay(25);
  }
  await stop(child);
  assert.ok(logs.includes(marker), `${name} did not become ready:\n${logs}`);
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 1000);
  await exited;
  clearTimeout(timer);
}

try {
  const runtime = (await run(singBox, ["version"])).stdout.match(/^sing-box version (\S+)/)?.[1];
  const clientVersion = (await run(mihomo, ["-v"])).stdout.trim().split("\n")[0];
  assert.match(runtime || "", /^1\.(13|14)\./);
  const certificatePath = join(directory, "certificate.pem");
  const keyPath = join(directory, "private-key.pem");
  await run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", keyPath,
    "-out", certificatePath, "-subj", "/CN=upgrade.fixture.invalid", "-addext", "subjectAltName=DNS:upgrade.fixture.invalid"]);
  origin.listen(0, "127.0.0.1");
  await once(origin, "listening");
  const originPort = origin.address().port;
  const scenarios = [
    { type: "vless", transport: "none", format: "mihomo" },
    { type: "vless", transport: "ws", format: "mihomo" },
    ...["mihomo", "mihomo-modern"].map(format => ({ type: "vless", transport: "ws", format, tlsFingerprint: true })),
    ...["mihomo", "mihomo-modern"].flatMap(format => ["vmess", "vless", "trojan"].map(type => ({ type, format, transport: "httpupgrade" })))
  ];
  for (const scenario of scenarios) {
    const { type, transport, format, tlsFingerprint } = scenario;
    const scenarioIdentity = { format, type, transport };
    const label = `${format} ${type} ${transport}`;
    for (let attempt = 1; attempt <= 4; attempt++) {
      let server;
      let core;
      let mixedPort;
      try {
        const port = await unusedPort();
        mixedPort = await unusedPort();
        const usesTls = type === "trojan" || tlsFingerprint;
        const profile = normalizeProtocolConfig({ ...defaultProtocolConfigs().find(item => item.type === type),
          enabled: true, port, listen: "127.0.0.1", transport: { type: transport, path: "/fixture" },
          tls: usesTls ? { mode: "certificate", serverName: "upgrade.fixture.invalid", certificatePath, keyPath } : { mode: "none" } });
        const config = buildSingBoxConfig({ host: { kind: "local", runtimeVersion: runtime, region: "test" }, protocols: [profile],
          users: [{ ...credential, state: "active", portalStatus: "active", usedGb: 0, quotaGb: 10, expiresAt: "2099-01-01", nodeScope: ["all"] }],
          masterPassword: credential.serverPassword }, { runtimeDns: { mode: "system" } });
        config.route.rules = [{ action: "route", outbound: "direct", override_address: "127.0.0.1", override_port: originPort }];
        const client = buildProtocolClientConfig({ profiles: [profile], server: "127.0.0.1", credential,
          routePolicy: { mode: "global-proxy" }, probeUrl: `http://192.0.2.1:${originPort}/` });
        if (tlsFingerprint) {
          const outbound = client.outbounds.find(outbound => outbound.server);
          outbound.tls.alpn = ["http/1.1"];
          outbound.tls.utls = { enabled: true, fingerprint: "chrome" };
        }
        let { body } = buildSubscriptionArtifact({ format, singBoxConfig: client, routePolicy: { mode: "global-proxy" } });
        body = body.replace("mixed-port: 7890", `mixed-port: ${mixedPort}`);
        // Only the loopback TLS fixture uses a self-signed certificate. Product
        // exports retain certificate verification, asserted in subscription tests.
        if (usesTls) body = body.replaceAll("skip-cert-verify: false", "skip-cert-verify: true");
        const serverPath = join(directory, "server.json");
        const clientPath = join(directory, "client.yaml");
        await writeFile(serverPath, JSON.stringify(config));
        await writeFile(clientPath, body);
        await run(singBox, ["check", "-c", serverPath]);
        await run(mihomo, ["-t", "-d", directory, "-f", clientPath]);
        server = await launch(singBox, ["run", "-c", serverPath], "sing-box started", "server");
        core = await launch(mihomo, ["-d", directory, "-f", clientPath], "proxy listening at", "client", mixedPort);
        const response = await run("curl", ["--silent", "--show-error", "--noproxy", "", "--socks5-hostname", `127.0.0.1:${mixedPort}`,
          "--max-time", "5", `http://192.0.2.1:${originPort}/`], { timeout: 7000 });
        await stopOnPortConflict(core.child, "client", core.readLogs, mixedPort);
        assert.equal(response.stdout, "httpupgrade-fixture", `${label} must transfer a real response`);
        console.log(JSON.stringify({ runtime, clientVersion, ...scenarioIdentity, requestSucceeded: true }));
        break;
      } catch (error) {
        if (!(error instanceof PortConflictError) && core && hasMixedPortConflict(core.readLogs(), mixedPort)) {
          error = new PortConflictError(`client mixed-port conflict after request started:\n${core.readLogs()}`, { cause: error });
        }
        if (!(error instanceof PortConflictError) || attempt === 4) {
          const details = [
            error?.message || String(error),
            server ? `server logs:\n${server.readLogs()}` : "",
            core ? `client logs:\n${core.readLogs()}` : ""
          ].filter(Boolean).join("\n");
          throw new Error(`${label} failed:\n${details}`, { cause: error });
        }
        console.log(JSON.stringify({ ...scenarioIdentity, phase: "local-port-retry", attempt }));
      } finally {
        if (core) await stop(core.child);
        if (server) await stop(server.child);
      }
    }
  }
} finally {
  for (const child of children) await stop(child);
  if (origin.listening) await new Promise(resolve => origin.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
