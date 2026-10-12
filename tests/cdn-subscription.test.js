import assert from "node:assert/strict";
import test from "node:test";
import { buildUserClientConfig } from "../server/singbox/client-config.js";
import { defaultProtocolConfigs } from "../server/singbox/protocol-catalog.js";
import { buildSubscriptionArtifact } from "../server/subscriptions/formats.js";

const credential = {
  runtimeUuid: "3365c019-4b70-4dd5-9b3a-48d83a22f24d",
  runtimePassword: "dXNlci1wYXNzd29yZA==", serverPassword: "AAAAAAAAAAAAAAAAAAAAAA=="
};
const protocols = defaultProtocolConfigs().filter(p =>
  ["vmess", "trojan", "vless", "anytls", "hysteria", "tuic", "hysteria2"].includes(p.type)
).map(p => ({ ...p, enabled: true, tls: { ...p.tls, mode: "certificate", serverName: "node.example.com" } }));
const hosts = [{ id: "local", address: "node.example.com", protocols }];
const cdnIngress = { hostId: "local", sourceTag: "raylink-vless", domain: "cdn.example.com", path: "/0123456789abcdef0123456789abcdef" };
const tag = "raylink-local-vless-cdn";
const group = (config, name) => config.outbounds.find(o => o.tag === name)?.outbounds;
const section = (body, name) => body.split(`name: "${name}"`)[1]?.split(/\n  - /)[0];

test("CDN entry reuses the user's UUID, preserves seven nodes and joins TCP, smart, fallback and AI candidates", () => {
  const before = buildUserClientConfig({ credential, hosts });
  const after = buildUserClientConfig({ credential, hosts, cdnIngress });
  const nodes = after.outbounds.filter(o => o.server);
  assert.equal(nodes.length, 8);
  assert.deepEqual(nodes.filter(o => o.tag !== tag), before.outbounds.filter(o => o.server));
  assert.deepEqual(nodes.find(o => o.tag === tag), {
    type: "vless", tag, server: "cdn.example.com", server_port: 443, uuid: credential.runtimeUuid,
    tls: { enabled: true, server_name: "cdn.example.com" },
    transport: { type: "ws", path: cdnIngress.path, headers: { Host: "cdn.example.com" } }
  });
  for (const name of ["raylink-tcp", "raylink-smart", "raylink-ai", "raylink-ai-stable"]) {
    assert.ok(group(after, name)?.includes(tag), name);
  }
  for (const format of ["mihomo", "mihomo-modern"]) {
    const { body } = buildSubscriptionArtifact({ format, singBoxConfig: after });
    for (const name of ["TCP 稳定", "故障回退", "RayLink 智能", "AI 网站代理"]) {
      const candidates = section(body, name);
      // Modern exports use a filtered inline provider and a separate AI node selector.
      assert.match(name === "AI 网站代理" && format === "mihomo-modern"
        ? section(body, "AI 节点选择") : candidates, /raylink-local-vless-cdn/, `${format}: ${name}`);
    }
    const node = section(body, tag);
    assert.match(node, /server: "cdn.example.com"/);
    assert.match(node, /port: 443/);
    assert.match(node, /tls: true/);
    assert.match(node, /servername: "cdn.example.com"/);
    assert.match(node, /network: "ws"/);
    assert.match(node, /ws-opts:/);
    assert.ok(node.includes(`path: "${cdnIngress.path}"`));
    assert.match(node, /Host: "cdn.example.com"/);
    assert.ok(node.includes(credential.runtimeUuid));
  }
});

test("CDN edge DNS is never pinned in any export, even if an endpoint fallback contains the origin IP", () => {
  const singBoxConfig = buildUserClientConfig({ credential, hosts, cdnIngress });
  for (const format of ["mihomo", "mihomo-modern", "singbox", "loon", "egern", "egern-profile"]) {
    const artifact = buildSubscriptionArtifact({ format, singBoxConfig,
      dynamicEndpointHostnames: [cdnIngress.domain],
      endpointOverrides: { "node.example.com": "203.0.113.10", "cdn.example.com": "203.0.113.99", "CDN.EXAMPLE.COM.": "203.0.113.99" }
    });
    assert.doesNotMatch(artifact.body, /203\.0\.113\.99/, format);
    assert.match(artifact.body, /203\.0\.113\.10/, "original Host endpoint fallback is preserved");
    assert.match(artifact.body, /cdn\.example\.com/, format);
  }
});

test("CDN follows source Host eligibility, user credentials and AI pinning without leaking another Host", () => {
  const other = { ...hosts[0], id: "remote" };
  for (const available of [[other], [{ ...hosts[0], protocols: [] }],
    [{ ...hosts[0], protocols: protocols.map(p => p.type === "vless" ? { ...p, enabled: false } : p) }],
    [{ ...hosts[0], protocols: protocols.map(p => p.type === "vless" ? { ...p, transport: { type: "ws", path: "/other" } } : p) }]]) {
    assert.ok(!buildUserClientConfig({ credential, hosts: [...available, { ...other, id: "backup" }], cdnIngress }).outbounds.some(o => o.tag === tag));
  }
  for (const hostId of ["local", "remote"]) {
    const secondUser = { ...credential, runtimeUuid: "99508625-3fb7-42ac-95b0-b87ac60b633e" };
    const config = buildUserClientConfig({ credential: secondUser, hosts: [...hosts, other], cdnIngress,
      routePolicy: { aiExit: { mode: "pinned", hostId } } });
    assert.equal(config.outbounds.find(o => o.tag === tag).uuid, secondUser.runtimeUuid);
    assert.equal(group(config, "raylink-ai").includes(tag), hostId === "local");
    assert.equal(group(config, "raylink-ai-stable").includes(tag), hostId === "local");
    assert.ok(group(config, "raylink-tcp").includes(tag));
  }
});
