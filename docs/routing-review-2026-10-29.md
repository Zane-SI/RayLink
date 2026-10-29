# Routing review and debug — 2026-10-29

Scope: the deployed routing changes since `049bdd3`, preserving ordinary
Google routing and AI-only residential egress while fixing App Store and
Tailscale compatibility. The standards and requirements reviews were performed
independently. Credentials, accounts and node membership were not changed.

## Standards

No hard coding-standard violation was found. The review identified two
diagnostic/implementation gaps in the initial Tailscale patch: diagnostics said
system DNS while exports selected Quad100, and private names inherited a generic
optimistic resolution path. Both are removed by leaving tailnet-specific DNS to
the client OS instead of claiming every `ts.net` host is private.

The unconditional partial Mihomo `tun` block was an unverified application
integration assumption. It is removed. Native sing-box, whose complete TUN
configuration is generated here, retains mesh-range routing exclusions.

## Spec

The initial patch incorrectly forced public Funnel hosts under `ts.net` to a
running local Tailscale resolver. The default now only manages Tailscale's public
control/relay suffix; it leaves private split DNS to the affected client.

The review also found a production/test mismatch: the HTTP application supplies
`ruleSetBaseUrl`, selecting a remote Mihomo HTTP/MRS adblock provider, while the
native regression previously omitted it and exercised an inline provider only.
The regression now supplies that source shape and holds the remote download
open. Before the fix the first real Google-CDN request fails with curl 52
(`Empty reply from server`). With the verified baseline embedded, both Mihomo
formats pass immediately without attempting the unavailable download.

## Causal evidence and limits

Mihomo initializes remote providers before enabling ordinary tunnel traffic.
An early connection can close while initialization is pending. In an isolated
public-subscription comparison, early requests failed; after provider loading
the same configuration received Google 204, GitHub 200 and OpenAI API 401.
Inlining the same 58,417 domains removed the network startup dependency while
preserving ad blocking. This establishes the cold-start blackout; it does not
explain every persistent failure after initialization.

The final public-path check must distinguish a successful network connection
from application availability: anonymous ChatGPT/Claude probes can return a
Cloudflare challenge, and an API 401 proves only an authentication response.
An authenticated browser session is a separate acceptance step. Real Mac
observations must identify which subscription is active; the user switched to
another subscription during this investigation.

Tests: the focused unit suite, cold-start native Mihomo profiles, complete
regression suite, deployed source hashes and actual subscribed artifact are
checked separately. Native loopback fixtures do not validate macOS route
ownership, an authorized Tailscale peer, browser login or a model invocation.

The final local suite passed 814 tests with one intentional skip (815 total).
The native cold-start regression passed for Mihomo and Mihomo Modern and also
verified that a known advertising domain remains blocked. A sing-box 1.14.2
configuration check passed. An isolated real-network profile bound to physical
`en0` received Google/gstatic 204, GitHub/Baidu 200 and OpenAI API 401. Google
root returned a Hong Kong redirect; anonymous ChatGPT returned a challenge.
These observations do not establish authenticated ChatGPT browser acceptance.
