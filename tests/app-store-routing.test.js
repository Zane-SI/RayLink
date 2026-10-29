import assert from "node:assert/strict";
import test from "node:test";
import { routingDecisionForDomain } from "../server/routing/policy.js";
import { buildProtocolClientConfig, defaultProtocolConfigs } from "../server/singbox/protocol-catalog.js";
import { buildSubscriptionArtifact } from "../server/subscriptions/formats.js";

const storeHosts = [
  "apps.apple.com", "amp-api.apps.apple.com", "amp-api-updates.apps.apple.com",
  "itunes.apple.com", "bag.itunes.apple.com", "p48-buy.itunes.apple.com",
  "osxapps.itunes.apple.com", "is1-ssl.mzstatic.com",
  "gsa.apple.com", "idmsa.apple.com", "account.apple.com", "appleid.cdn-apple.com"
];
const suffixes = ["apps.apple.com", "itunes.apple.com", "mzstatic.com"];
const names = ["gsa.apple.com", "idmsa.apple.com", "account.apple.com", "appleid.cdn-apple.com"];
const config = (routePolicy = {}) => buildProtocolClientConfig({
  profiles: defaultProtocolConfigs(), server: "node.example.com",
  credential: { email: "store-test@example.com", runtimePassword: "fixture", serverPassword: "fixture" },
  routePolicy
});
const matches = (rule, host) => rule.domain?.includes(host)
  || rule.domain_suffix?.some(s => host === s || host.endsWith(`.${s}`));

test("smart policy keeps App Store content, account and downloads on local DNS and one direct exit", () => {
  for (const host of storeHosts) {
    const decision = routingDecisionForDomain({}, host);
    assert.equal(decision.action, "direct", host);
    assert.equal(decision.dns, "domestic", host);
  }
  for (const host of ["notapps.apple.com", "apps.apple.com.example", "mzstatic.com.example", "child.gsa.apple.com", "www.apple.com", "mask.icloud.com"]) {
    assert.notEqual(routingDecisionForDomain({}, host).source, "app-store", host);
  }
  assert.equal(routingDecisionForDomain({}, "chatgpt.com").action, "ai");
  assert.equal(routingDecisionForDomain({}, "github.com").action, "proxy");
});

test("native subscription routes App Store before adblock/geography and aligns DNS", () => {
  const native = config();
  for (const host of storeHosts) {
    const route = native.route.rules.find(r => matches(r, host) && r.action !== "resolve");
    assert.equal(route?.outbound, "direct", host);
    const adblock = native.route.rules.findIndex(r => r.rule_set === "adblock-johnshall");
    assert.ok(adblock < 0 || native.route.rules.indexOf(route) < adblock, host);
    assert.equal(native.dns.rules.find(r => matches(r, host))?.server, "dns-domestic", host);
  }
});

test("Mihomo and Egern full subscriptions include store bypasses before generic blocking", () => {
  const native = config();
  for (const format of ["mihomo", "mihomo-modern", "egern-profile"]) {
    const body = buildSubscriptionArtifact({ format, singBoxConfig: native }).body;
    for (const domain of [...names, ...suffixes]) {
      if (format === "egern-profile") {
        assert.ok(body.includes(`match: "${domain}"\n      policy: "DIRECT"`), `${format}: route ${domain}`);
        assert.ok(body.includes(`match: "${domain}"\n        value: "domestic"`), `${format}: DNS ${domain}`);
      } else {
        const kind = names.includes(domain) ? "DOMAIN" : "DOMAIN-SUFFIX";
        const rule = `${kind},${domain},DIRECT`;
        assert.ok(body.includes(rule), `${format}: route ${domain}`);
        const block = body.indexOf("RULE-SET,raylink-adblock,REJECT");
        assert.ok(block < 0 || body.indexOf(rule) < block, `${format}: priority ${domain}`);
        const key = names.includes(domain) ? domain : `+.${domain}`;
        assert.ok(body.includes(`    ${JSON.stringify(key)}:\n      - "https://223.5.5.5/dns-query"`), `${format}: DNS ${domain}`);
      }
    }
  }
});

test("explicit modes and custom store routing retain priority over the smart defaults", () => {
  for (const [mode, action] of [["direct", "direct"], ["global-proxy", "proxy"]]) {
    assert.equal(routingDecisionForDomain({ mode }, "gsa.apple.com").action, action);
    for (const format of ["mihomo", "mihomo-modern"]) {
      const body = buildSubscriptionArtifact({ format, singBoxConfig: config({ mode }), routePolicy: { mode } }).body;
      assert.ok(!body.includes("DOMAIN,gsa.apple.com,DIRECT"));
    }
  }
  const routePolicy = { rules: [{ match: "domain_suffix", value: "itunes.apple.com", action: "proxy" }] };
  assert.equal(routingDecisionForDomain(routePolicy, "p48-buy.itunes.apple.com").action, "proxy");
  const native = config(routePolicy);
  assert.equal(native.route.rules.find(r => matches(r, "p48-buy.itunes.apple.com") && r.action !== "resolve")?.outbound, "raylink-auto");
  assert.equal(native.dns.rules.find(r => matches(r, "p48-buy.itunes.apple.com"))?.server, "dns-remote");
  for (const format of ["mihomo", "mihomo-modern"]) {
    const body = buildSubscriptionArtifact({ format, singBoxConfig: native, routePolicy }).body;
    assert.ok(body.indexOf("DOMAIN-SUFFIX,itunes.apple.com,普通代理") < body.indexOf("DOMAIN-SUFFIX,itunes.apple.com,DIRECT"));
    assert.ok(body.includes("    \"+.itunes.apple.com\":\n      - \"https://1.1.1.1/dns-query#普通代理\""));
  }
});
