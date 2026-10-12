import {
  buildMultiHostProtocolClientConfig
} from "./protocol-catalog.js";

export function buildUserClientConfig({
  credential,
  hosts,
  ruleSetBaseUrl = null,
  probeUrl,
  routePolicy,
  cdnIngress
}) {
  return buildMultiHostProtocolClientConfig({
    credential,
    hosts: hosts || [],
    ruleSetBaseUrl,
    probeUrl,
    routePolicy,
    cdnIngress
  });
}
