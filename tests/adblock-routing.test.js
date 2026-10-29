import assert from "node:assert/strict";
import test from "node:test";

import {
  getBundledAdblockArtifact,
  getBundledAdblockDomains,
  getBundledAdblockVersion
} from "../server/routing/adblock/bundled.js";
import {
  buildProtocolClientConfig,
  defaultProtocolConfigs
} from "../server/singbox/protocol-catalog.js";
import { buildSubscriptionArtifact } from "../server/subscriptions/formats.js";

const credential = {
  email: "test@example.com",
  runtimeUuid: "3365c019-4b70-4dd5-9b3a-48d83a22f24d",
  runtimePassword: "fixture",
  serverPassword: "AAAAAAAAAAAAAAAAAAAAAA=="
};

function clientConfig(ruleSetBaseUrl, routePolicy) {
  return buildProtocolClientConfig({
    profiles: defaultProtocolConfigs(),
    credential,
    server: "node.example.com",
    ...(ruleSetBaseUrl ? { ruleSetBaseUrl } : {}),
    ...(routePolicy ? { routePolicy } : {})
  });
}

test("reviewed ad-block bundle is domain-only and every served artifact is verified", () => {
  const domains = getBundledAdblockDomains();
  assert.equal(domains.length, 58_417);
  assert.equal(getBundledAdblockVersion(), "johnshall-aa5fd1b1ef00");
  assert.ok(domains.includes("adservice.google.com"));
  assert.ok(domains.includes("r.openai.com"), "ordering tests must cover a real AI overlap");
  assert.ok(!domains.some((domain) => domain.includes("/")), "IP/CIDR rules are intentionally excluded");
  for (const filename of [
    "adblock-johnshall.srs",
    "adblock-johnshall.mrs",
    "adblock-johnshall-egern.yaml"
  ]) {
    assert.ok(getBundledAdblockArtifact(filename).length > 100_000);
  }
  assert.equal(getBundledAdblockArtifact("../manifest.json"), null);
});

test("AI and explicit user routes precede ad blocking in every full subscription format", () => {
  const routePolicy = {
    mode: "smart",
    rules: [{
      match: "domain",
      value: "r.openai.com",
      action: "direct",
      dns: "domestic",
      priority: 1,
      enabled: true
    }]
  };
  const config = clientConfig("https://sub.example.com/rule-sets/", routePolicy);

  const nativeCustom = config.route.rules.findIndex((rule) => rule.domain?.includes("r.openai.com"));
  const nativeAi = config.route.rules.findIndex((rule) => rule.outbound === "raylink-ai");
  const nativeAdblock = config.route.rules.findIndex((rule) => rule.rule_set === "adblock-johnshall");
  assert.ok(nativeCustom < nativeAi && nativeAi < nativeAdblock);
  assert.equal(config.route.rules[nativeAdblock].action, "reject");

  const mihomo = buildSubscriptionArtifact({
    format: "mihomo",
    singBoxConfig: config,
    routePolicy
  }).body;
  assert.match(mihomo, /raylink-adblock:\n\s+type: "inline"[\s\S]*?format: "yaml"[\s\S]*?payload:/);
  assert.doesNotMatch(mihomo, /adblock-johnshall\.mrs/);
  const mihomoRules = mihomo.split("\nrules:\n")[1];
  assert.ok(mihomoRules.indexOf("DOMAIN,r.openai.com,DIRECT") < mihomoRules.indexOf("DOMAIN-SUFFIX,openai.com,AI 代理"));
  assert.ok(mihomoRules.indexOf("DOMAIN-SUFFIX,openai.com,AI 代理") < mihomoRules.indexOf("RULE-SET,raylink-adblock,REJECT"));

  const egern = buildSubscriptionArtifact({
    format: "egern-profile",
    singBoxConfig: config,
    routePolicy
  }).body;
  const egernRules = egern.split("\nrules:\n")[1];
  assert.match(egernRules, /rule_set:\n\s+name: "RayLink 广告拦截"\n\s+match: "https:\/\/sub\.example\.com\/rule-sets\/adblock-johnshall-egern\.yaml"\n\s+policy: "REJECT"/);
  assert.ok(egernRules.indexOf('match: "r.openai.com"\n      policy: "DIRECT"')
    < egernRules.indexOf('match: "openai.com"\n      policy: "AI 代理"'));
  assert.ok(egernRules.indexOf('match: "openai.com"\n      policy: "AI 代理"')
    < egernRules.indexOf('name: "RayLink 广告拦截"'));
});

test("offline subscriptions retain a complete inline ad-block fallback", () => {
  const config = clientConfig();
  const provider = buildSubscriptionArtifact({ format: "mihomo", singBoxConfig: config }).body
    .split("  raylink-adblock:\n")[1]
    .split("\nrules:\n")[0];
  assert.match(provider, /type: "inline"/);
  assert.match(provider, /behavior: "domain"/);
  assert.match(provider, /\+\.adservice\.google\.com/);
  assert.doesNotMatch(provider, /IP-CIDR/);
});

test("public Mihomo subscriptions carry all adblock rules without a startup download", () => {
  for (const format of ["mihomo", "mihomo-modern"]) {
    const body = buildSubscriptionArtifact({ format, singBoxConfig: clientConfig("https://unavailable.example/rule-sets/") }).body;
    const provider = body.split("  raylink-adblock:\n")[1].split("\nrules:\n")[0];
    assert.match(provider, /type: "inline"/);
    assert.doesNotMatch(provider, /type: "http"|\n\s+url:|format: "mrs"/);
    assert.equal([...provider.matchAll(/- "\+\./g)].length, getBundledAdblockDomains().length);
  }
});

test("direct and global modes protect AI dependencies before ad blocking", () => {
  const subscriptionConfig = clientConfig("https://sub.example.com/rule-sets/");
  for (const [mode, policy, outbound] of [
    ["direct", "DIRECT", "direct"],
    ["global-proxy", "普通代理", "raylink-auto"]
  ]) {
    const nativeConfig = buildProtocolClientConfig({
      profiles: defaultProtocolConfigs(),
      credential,
      server: "node.example.com",
      ruleSetBaseUrl: "https://sub.example.com/rule-sets/",
      routePolicy: { mode }
    });
    const nativeAi = nativeConfig.route.rules.findIndex(
      (rule) => rule.domain_suffix?.includes("openai.com")
    );
    const nativeAdblock = nativeConfig.route.rules.findIndex(
      (rule) => rule.rule_set === "adblock-johnshall"
    );
    assert.ok(nativeAi >= 0 && nativeAi < nativeAdblock);
    assert.equal(nativeConfig.route.rules[nativeAi].outbound, outbound);

    for (const format of ["mihomo", "egern-profile"]) {
      const rules = buildSubscriptionArtifact({
        format,
        singBoxConfig: subscriptionConfig,
        routePolicy: { mode }
      }).body.split("\nrules:\n")[1];
      const aiRule = format === "mihomo"
        ? `DOMAIN-SUFFIX,openai.com,${policy}`
        : `match: "openai.com"\n      policy: "${policy}"`;
      const adblockRule = format === "mihomo"
        ? "RULE-SET,raylink-adblock,REJECT"
        : 'name: "RayLink 广告拦截"';
      assert.ok(rules.indexOf(aiRule) >= 0 && rules.indexOf(aiRule) < rules.indexOf(adblockRule));
    }
  }
});
