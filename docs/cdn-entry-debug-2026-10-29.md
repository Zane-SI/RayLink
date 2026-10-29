# CDN entry investigation — 2026-10-29

The CDN repair has **not passed public stability acceptance**. The original
CDN adapter, Caddyfile and generated subscriptions remain in production. The
seven original protocol nodes and main runtime were preserved. This report
does not claim that Google or authenticated ChatGPT sessions are stable.

## Reproduction and boundaries

The Mac's active working subscription was preserved. Tests used isolated native
clients with no TUN, physical `en0`, dynamic Cloudflare DNS and certificate
verification. Mihomo 1.19.25 and the same 1.19.32 core version reported by the
installed client reproduced the failure; the latter binary was obtained from
the official release and its published SHA-256 verified. A separate sing-box
1.14.2 client also reproduced public-path connection timeouts.

The minimized CDN-only configuration excludes provider downloads, large routing
tables, competing health checks and other proxy chains. Repeated failures
therefore occur independently of those subscription features. Several Mihomo
failures occur at its five-second connection deadline. Slower requests can also
complete, so neither Cloudflare address is established to be permanently
unreachable. Ali, Google and Cloudflare DNS returned the same Cloudflare A
records; no client hosts entry or persistent edge-IP pin was added.

The authenticated server-side data-path test passed at all three stages:
loopback WS adapter, Caddy with verified origin TLS, and the public Cloudflare
hostname. Google/gstatic returned 200/204 and OpenAI API returned 401. Per-user
UUID authorization also matched the subscribed user. These tests establish
working forwarding at the time of measurement, rather than merely a 101
WebSocket upgrade. They do not establish the Mac-to-Cloudflare path.

On the Mac, ordinary HTTPS to the CDN hostname sometimes completes while other
TLS/WS connections time out. Alternative TLS fingerprints, explicit HTTP/1.1,
early data and connection reuse did not pass repeated stability checks. A
temporary HTTP/2 experiment was inconclusive and was removed.
Alternative Cloudflare TLS ports did not establish an advantage. This evidence
localizes the unresolved problem to the public client/CDN transport path; it
does not identify an ISP policy or prove GFW blocking.

An additional differential test kept the original CDN configuration and
credentials, but reached it through the Mac's currently working subscription
as a temporary diagnostic parent. All eight requests received responses:
Google 200/204, OpenAI API 401 and ChatGPT's challenge page. The direct physical
path continued to time out. No parent proxy was added to the user's active
configuration or to production. This narrows the failure to the public path
without making the backup depend on another subscription.

## Safe source correction

The investigation found a separate export defect: certificate-TLS outbounds
lost explicitly configured ALPN and enabled uTLS fingerprints when converted
to Mihomo/Mihomo Modern. The converter now retains both, keeps certificate
verification enabled, and leaves disabled uTLS disabled. The regression covers
VMess, VLESS and Trojan in both formats without mutating the shared input.

This correction does not automatically turn on a fingerprint or early data in
existing CDN subscriptions. It must not be described as a verified CDN timeout
repair. Experimental CDN defaults were removed from the source candidate.

Final source verification: 816 tests, 815 passed, one intentional skip and no
failures. Ten native sing-box 1.14.2 / Mihomo 1.19.32 interoperability scenarios
passed, including certificate TLS with Chrome/HTTP/1.1 WebSocket in both export
formats. The export correction is a source change, not a deployed CDN repair.

## Production state and application acceptance

The original adapter generator, CDN config and Caddyfile were restored and their
hashes independently matched the pre-investigation values. Main runtime config
and PID remained unchanged. Temporary probe services/configurations were
removed. No Cloudflare DNS or account settings were changed. The platform has
no configured Cloudflare DNS API credential.

An isolated full production subscription using Mihomo 1.19.32 selected the
existing VMess node through both default fallback groups. Two Google homepage
requests returned 200 after the Hong Kong redirect; two OpenAI API requests
returned 401; two ChatGPT homepage requests returned 403 with
`cf-mitigated: challenge`. One repeated Google 204 probe still hit a five-second
connection failure. This is partial network evidence, not complete stability
acceptance. The ChatGPT verification page and authenticated browser/API usage
remain separate unresolved acceptance steps.

Use the existing automatic groups for ordinary and AI traffic while the CDN is
unqualified. Ordinary Google retains server egress; only eligible AI traffic
uses the configured residential upstream. A different usable CDN edge route or
an independently tested network path is needed before promoting the CDN
candidate. Do not weaken TLS verification, pin an edge IP, or send ordinary
Google through the residential proxy to mask this failure.
