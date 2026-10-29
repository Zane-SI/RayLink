import assert from "node:assert/strict";
import test from "node:test";
import { routingDecisionForDomain } from "../server/routing/policy.js";
import { buildProtocolClientConfig, defaultProtocolConfigs } from "../server/singbox/protocol-catalog.js";
import { buildSubscriptionArtifact } from "../server/subscriptions/formats.js";

function config(routePolicy = {}) {
  return buildProtocolClientConfig({ profiles: defaultProtocolConfigs(), server: "node.example.com",
    credential: { email: "vpn-test@example.com", runtimePassword: "fixture", serverPassword: "fixture" }, routePolicy });
}

test("Tailscale controls use direct routing without claiming every ts.net host is private", () => {
  for (const host of ["controlplane.tailscale.com", "login.tailscale.com", "derp20.tailscale.com"]) {
    const decision = routingDecisionForDomain({}, host);
    assert.equal(decision.action, "direct", host);
    assert.equal(decision.dns, "domestic", host);
  }
  for (const domain of ["device.fixture-tailnet.ts.net", "public-funnel.other-tailnet.ts.net"]) {
    assert.equal(routingDecisionForDomain({}, domain).source, "geoip");
  }
  for (const host of ["tailscale.com.example", "not-tailscale.com", "ts.net.example"]) {
    assert.notEqual(routingDecisionForDomain({}, host).source, "tailscale");
  }
  assert.equal(routingDecisionForDomain({ rules: [{ match: "domain_suffix", value: "tailscale.com", action: "proxy" }] }, "login.tailscale.com").action, "proxy");
  assert.equal(routingDecisionForDomain({ mode: "global-proxy" }, "login.tailscale.com").action, "proxy");
});

test("native TUN excludes mesh ranges without forcing shared ts.net DNS to Quad100", () => {
  const c = config();
  assert.deepEqual(c.inbounds.find(i => i.type === "tun").route_exclude_address, ["100.64.0.0/10", "fd7a:115c:a1e0::/48"]);
  assert.ok(c.route.rules.some(r => r.domain_suffix?.includes("tailscale.com") && r.outbound === "direct"));
  assert.ok(!c.route.rules.some(r => r.domain_suffix?.includes("ts.net")));
  assert.equal(c.dns.rules.find(r => r.domain_suffix?.includes("tailscale.com"))?.server, "dns-domestic");
  assert.ok(!c.dns.rules.some(r => r.domain_suffix?.includes("ts.net")));
  assert.ok(!c.dns.servers.some(s => s.server === "100.100.100.100"));
});

test("Mihomo bypasses control fake IP while leaving client TUN and shared ts.net DNS alone", () => {
  for (const format of ["mihomo", "mihomo-modern"]) {
    const body = buildSubscriptionArtifact({ format, singBoxConfig: config() }).body;
    assert.ok(!body.includes('\ntun:'));
    const filter = body.split('  fake-ip-filter:\n')[1].split('  respect-rules:')[0];
    for (const suffix of ["tailscale.com", "ts.net"]) {
      assert.ok(filter.includes(`"+.${suffix}"`));
    }
    assert.ok(body.includes('DOMAIN-SUFFIX,tailscale.com,DIRECT'));
    assert.ok(!body.includes('DOMAIN-SUFFIX,ts.net,DIRECT'));
    assert.ok(body.includes('    "+.tailscale.com":\n      - "https://223.5.5.5/dns-query"'));
    assert.ok(!body.includes('    "+.ts.net":'));
    assert.ok(!body.includes('100.100.100.100'));
  }
});
