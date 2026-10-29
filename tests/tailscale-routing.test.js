import assert from "node:assert/strict";
import test from "node:test";
import { routingDecisionForDomain } from "../server/routing/policy.js";
import { buildProtocolClientConfig, defaultProtocolConfigs } from "../server/singbox/protocol-catalog.js";
import { buildSubscriptionArtifact } from "../server/subscriptions/formats.js";

function config(routePolicy = {}) {
  return buildProtocolClientConfig({ profiles: defaultProtocolConfigs(), server: "node.example.com",
    credential: { email: "vpn-test@example.com", runtimePassword: "fixture", serverPassword: "fixture" }, routePolicy });
}

test("Tailscale control and MagicDNS are distinct direct paths in smart routing", () => {
  for (const host of ["controlplane.tailscale.com", "login.tailscale.com", "derp20.tailscale.com"]) {
    const decision = routingDecisionForDomain({}, host);
    assert.equal(decision.action, "direct", host);
    assert.equal(decision.dns, "domestic", host);
  }
  const magic = routingDecisionForDomain({}, "device.fixture-tailnet.ts.net");
  assert.equal(magic.action, "direct");
  assert.equal(magic.dns, "system");
  for (const host of ["tailscale.com.example", "not-tailscale.com", "ts.net.example"]) {
    assert.notEqual(routingDecisionForDomain({}, host).source, "tailscale");
  }
  assert.equal(routingDecisionForDomain({ rules: [{ match: "domain_suffix", value: "tailscale.com", action: "proxy" }] }, "login.tailscale.com").action, "proxy");
  assert.equal(routingDecisionForDomain({ mode: "global-proxy" }, "login.tailscale.com").action, "proxy");
});

test("native TUN excludes mesh ranges and private DNS uses the local Tailscale resolver", () => {
  const c = config();
  assert.deepEqual(c.inbounds.find(i => i.type === "tun").route_exclude_address, ["100.64.0.0/10", "fd7a:115c:a1e0::/48"]);
  assert.ok(c.route.rules.some(r => r.domain_suffix?.includes("tailscale.com") && r.outbound === "direct"));
  assert.ok(c.route.rules.some(r => r.domain_suffix?.includes("ts.net") && r.outbound === "direct"));
  assert.equal(c.dns.rules.find(r => r.domain_suffix?.includes("tailscale.com"))?.server, "dns-domestic");
  assert.equal(c.dns.rules.find(r => r.domain_suffix?.includes("ts.net"))?.server, "dns-tailnet");
  assert.deepEqual(c.dns.servers.find(s => s.tag === "dns-tailnet"), {
    type: "udp", tag: "dns-tailnet", server: "100.100.100.100", server_port: 53, detour: "direct"
  });
});

test("Mihomo profiles avoid fake IP for Tailscale and advertise exclusions without enabling TUN", () => {
  for (const format of ["mihomo", "mihomo-modern"]) {
    const body = buildSubscriptionArtifact({ format, singBoxConfig: config() }).body;
    assert.ok(body.includes('  route-exclude-address:\n    - "100.64.0.0/10"\n    - "fd7a:115c:a1e0::/48"'));
    assert.ok(!body.includes('tun:\n  enable: true'));
    const filter = body.split('  fake-ip-filter:\n')[1].split('  respect-rules:')[0];
    for (const suffix of ["tailscale.com", "ts.net"]) {
      assert.ok(filter.includes(`"+.${suffix}"`));
      assert.ok(body.includes(`DOMAIN-SUFFIX,${suffix},DIRECT`));
    }
    assert.ok(body.includes('    "+.tailscale.com":\n      - "https://223.5.5.5/dns-query"'));
    assert.ok(body.includes('    "+.ts.net":\n      - "udp://100.100.100.100:53"'));
  }
});
