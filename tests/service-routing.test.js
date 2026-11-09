import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseRoutingDomain } from "../server/routing/diagnostics.js";
import { buildProtocolClientConfig, defaultProtocolConfigs } from "../server/singbox/protocol-catalog.js";
import { buildSubscriptionArtifact } from "../server/subscriptions/formats.js";

const cases = [
  ["mmbiz.qpic.cn", "domestic-app", "direct", "dns-domestic"],
  ["sf1.douyinpic.com", "domestic-app", "direct", "dns-domestic"],
  ["apps-marketplace.apple.com", "app-store", "direct", "dns-domestic"],
  ["controlplane.tailscale.com", "tailscale", "direct", "dns-domestic"],
  ["www.google.com", "google", "raylink-auto", "dns-remote"],
  ["drive.googleusercontent.com", "google", "raylink-auto", "dns-remote"],
  ["www.youtube-nocookie.com", "youtube", "raylink-auto", "dns-remote"],
  ["youtubei.googleapis.com", "youtube", "raylink-auto", "dns-remote"],
  ["gemini.google.com", "ai", "raylink-ai", "dns-ai"],
  ["generativelanguage.googleapis.com", "ai", "raylink-ai", "dns-ai"],
  ["chatgpt.com", "ai", "raylink-ai", "dns-ai"]
];
const matches = (rule, host) => rule.domain?.includes(host)
  || rule.domain_suffix?.some(s => host === s || host.endsWith(`.${s}`));

function config(routePolicy = {}) {
  return buildProtocolClientConfig({
    profiles: defaultProtocolConfigs(), server: "node.example.com",
    credential: { email: "test@example.com", runtimePassword: "fixture", serverPassword: "fixture" },
    routePolicy
  });
}

test("smart service categories diagnose the same routes and DNS as sing-box", async () => {
  const native = config();
  for (const [host, source, outbound, dns] of cases) {
    const result = await diagnoseRoutingDomain({ domain: host, lookup: () => { throw Error("unexpected DNS lookup"); } });
    assert.equal(result.source, source, host);
    assert.equal(result.outbound, outbound, host);
    assert.equal(native.route.rules.find(r => r.action === "route" && matches(r, host))?.outbound, outbound, host);
    assert.equal(native.dns.rules.find(r => matches(r, host))?.server, dns, host);
  }
  for (const host of ["wx-love-img.afunapp.com", "unrelated.apple.com", "funnel.example.ts.net", "notyoutube-nocookie.com", "douyinpic.com.example"]) {
    assert.ok(!native.route.rules.some(r => matches(r, host)), host);
  }
});

test("full subscriptions add service rules without adding selectors or sweeping shared domains into AI", () => {
  for (const format of ["mihomo", "mihomo-modern", "egern-profile"]) {
    const body = buildSubscriptionArtifact({ format, singBoxConfig: config() }).body;
    const ordinary = format === "egern-profile"
      ? 'match: "youtubei.googleapis.com"\n      policy: "普通代理"'
      : "DOMAIN,youtubei.googleapis.com,普通代理";
    const shared = format === "egern-profile"
      ? 'match: "googleapis.com"\n      policy: "普通代理"'
      : "DOMAIN-SUFFIX,googleapis.com,普通代理";
    assert.ok(body.includes(ordinary) && body.indexOf(ordinary) < body.indexOf(shared), format);
    for (const name of ["国内应用", "App Store", "Tailscale", "Google", "YouTube"]) {
      assert.ok(!body.includes(`name: "${name}"`), format);
    }
    const egern = format === "egern-profile";
    const groups = (body.split(egern ? "\npolicy_groups:\n" : "\nproxy-groups:\n")[1]
      .split(/\n(?:rules|rule-providers):\n/)[0] + "\n").split(/^  - /m);
    const selectors = groups.filter(block => !block.includes("hidden: true"))
      .map(block => block.match(/(?:^|\n +)name: "([^"]+)"/)?.[1]).filter(Boolean);
    assert.deepEqual(selectors.sort(), ["AI 代理", "普通代理", "未分类流量"].sort());
  }
});


test("custom rules still take priority over matching service routes and DNS", async () => {
  const policy = { rules: [{ match: "domain_suffix", value: "googleapis.com", action: "direct" }] };
  const native = config(policy);
  for (const host of ["youtubei.googleapis.com", "generativelanguage.googleapis.com"]) {
    const decision = await diagnoseRoutingDomain({ domain: host, policy });
    assert.equal(decision.source, "custom", host);
    assert.equal(decision.outbound, "direct", host);
    assert.equal(native.route.rules.find(r => r.action === "route" && matches(r, host))?.outbound, "direct", host);
    assert.equal(native.dns.rules.find(r => matches(r, host))?.server, "dns-domestic", host);
  }
  const body = buildSubscriptionArtifact({ format: "mihomo", singBoxConfig: native, routePolicy: policy }).body;
  assert.ok(body.indexOf("DOMAIN-SUFFIX,googleapis.com,DIRECT") < body.indexOf("DOMAIN,youtubei.googleapis.com,普通代理"));
  assert.doesNotMatch(body, /^    "youtubei\.googleapis\.com":/m);
  assert.doesNotMatch(body, /^    "\+\.generativelanguage\.googleapis\.com":/m);
});
