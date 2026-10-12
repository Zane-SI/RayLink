# Optional Cloudflare VLESS / WebSocket ingress

This adapter adds one Caddy site and a separate loopback-only sing-box process. It does not modify RayLink's generated runtime or the seven existing protocol profiles. An optional control-plane setting appends a CDN node to each eligible User's generated subscription.

Path: client → Cloudflare (TLS) → Caddy (verified TLS) → loopback WS adapter → existing VLESS inbound (verified TLS, same User Runtime Credential) → existing routing and usage accounting.

The existing VLESS inbound must use certificate TLS, IPv4 loopback connectivity, unique named UUID users, and no additional transport or Vision flow. Unsupported source configurations stop only the adapter. There is no direct-egress fallback. Each adapter user authenticates again against the main runtime, so quota/expiry/disable changes remain enforced there even before synchronization.

## Installation contract

- DNS: proxied A record for the new hostname; Cloudflare Full (strict) and WebSockets enabled. Keep existing DNS records unchanged.
- Install `cdn-ingress.mjs` in `/usr/local/lib/raylink-cdn/` and the four `raylink-cdn*` units in `/etc/systemd/system/`. Units use the existing RayLink Node.js and sing-box binaries.
- Create root-owned `/var/lib/raylink-cdn` (0700), with `settings.json` (0600):

```json
{
  "sourceTag": "raylink-vless",
  "domain": "cdn.example.com",
  "listenPort": 18444,
  "path": "/REPLACE_WITH_48_RANDOM_LOWERCASE_HEX_CHARACTERS"
}
```

Generate the path once using a cryptographic random generator. Do not change it on every deployment. Check that the port is free. Run `raylink-cdn-sync.service` before exposing Caddy. Its native `sing-box check` must pass and the sidecar must be active. Enable `raylink-cdn.service`, `raylink-cdn-sync.path`, and `raylink-cdn-sync.timer` for boot.

Append only this block to the resolved managed Caddyfile (replace the domain/path):

```caddy
cdn.example.com {
  @ws path /REPLACE_WITH_THE_SAME_RANDOM_PATH
  handle @ws {
    reverse_proxy 127.0.0.1:18444 {
      stream_close_delay 5m
    }
  }
  handle {
    respond 404
  }
}
```

Do not use `handle_path`: stripping the path breaks the WebSocket handshake. Validate the complete candidate Caddyfile, then reload Caddy. Automatic ACME must obtain a publicly trusted certificate for this hostname; never weaken Full (strict) or client certificate checks to bypass an issuance failure.

The adapter configuration is regenerated when the main runtime file changes and every 30 seconds to cover missed events and certificate rotation. A changed configuration restarts **only the new adapter**, terminating its current connections; unchanged configurations do not restart it. The main runtime is never restarted by these units. Run a sync after an administrator deliberately changes settings. The adapter is an optional deployment component, not a new profile in the panel. Re-running the control-plane domain setup may regenerate Caddyfile: retain/reapply this extra site after reviewing that operation.

## Generated subscriptions

After the public CDN route passes native acceptance, set this in the control-plane environment file and restart **only `raylink.service`**:

```sh
RAYLINK_CDN_INGRESS_FILE=/var/lib/raylink-cdn/settings.json
```

The file is read at control-plane startup. Invalid configured settings prevent startup; an unset variable preserves existing subscriptions. Keep the file readable only by the service account. A deliberate domain/path change requires updating Caddy, syncing the adapter, restarting the control plane and refreshing complete client subscriptions.

The compiler appends `raylink-local-vless-cdn` with these fields:

- Server and TLS SNI: the new CDN hostname; port 443; certificate verification on.
- UUID: that User's existing VLESS UUID; encryption none; no Vision flow.
- Network: WebSocket; Host header: CDN hostname; path: exactly the generated path.
- Do not configure a client front proxy or residential dialer for this node. AI-only residential routing remains on the existing main runtime.

The node appears only when the User can use the local Host and its applied VLESS profile remains compatible with the adapter (certificate TLS, IPv4 loopback, no extra transport). It joins TCP 稳定, 故障回退, RayLink 智能 and eligible AI candidates. An AI pin to another Host excludes it from AI choices. Existing nodes and routing rules are retained. Modern Mihomo exports reference it through their shared inline provider; classic Mihomo exports include it directly.

The CDN hostname is excluded from endpoint IP overrides in all export formats. It must resolve to Cloudflare through the client's normal node DNS resolver; never put it in `hosts` or replace its server address with an origin/edge IP. A client chain using TCP 稳定 can select the new candidate without changing that chain. Refresh the **complete** subscription, then reconnect; a latency check alone does not fetch new nodes. Never publish a User's UUID or import URL in source control.

## Acceptance and removal

`SING_BOX_BIN=/path/to/metered/sing-box node tests/cdn-ingress-check.mjs` checks real WS transfers, per-user usage isolation, invalid UUID/path rejection, and revocation through the main runtime. Use a metered binary with `with_v2ray_api`.

Live acceptance additionally requires a native client request through the public CDN hostname, HTTPS certificate verification, origin versus CDN TLS checks, and unchanged original runtime hash/PID. A 404 from `/` is intentional and does not prove authenticated proxy access. CDN handshake success does not prove a phone/carrier can reach the route or improve latency.

To remove: unset `RAYLINK_CDN_INGRESS_FILE`, restart the control plane and refresh client subscriptions. Remove only the added Caddy site and reload after validation; disable/stop the adapter service, path and timer, then remove their dedicated files. Do not alter the main runtime or original seven profiles.
