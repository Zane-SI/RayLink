# Tailscale coexistence in smart subscriptions

The smart defaults send `tailscale.com` and its subdomains directly, using
domestic public DNS. Control-plane and DERP connections therefore do not depend
on the ordinary proxy or its unclassified selector. Explicit administrator
domain rules retain priority.

Mihomo full profiles exclude `tailscale.com` and `ts.net` from fake-IP allocation.
They do not emit a `tun` block: that belongs to the client application. Native
sing-box TUN profiles, whose network configuration is generated in full, exclude
`100.64.0.0/10` and `fd7a:115c:a1e0::/48`. Egern full profiles receive the
control-domain/DNS rules; node-only exports do not configure routing.

These are distinct protections: DIRECT is an outbound decision inside the
proxy, whereas TUN exclusion lets the operating system route to Tailscale.
Mihomo documents `route-exclude-address` as effective with native `auto-route`.
An app that manages macOS Network Extension routes itself must apply the
exclusions through its own integration. Presence of the YAML field does not
prove that a particular app installed the OS routes. No interface names,
tailnet names, exit nodes or per-device addresses are hard-coded.

`ts.net` is shared by private MagicDNS names and public Funnel URLs. The
subscription must not force the entire suffix to Quad100: public Funnel URLs
work without a running local Tailscale. Actual tailnet-specific DNS domains
belong to the operating system's Tailscale split DNS or a deliberate client
override for that exact tailnet. The server cannot infer a subscriber's private
tailnet or advertised subnets. Custom subnet routes need client exclusions too.
Tailscale exit nodes and platforms permitting only one active VPN need separate
handling. No end-to-end private-peer guarantee follows from these defaults.

Validation covers generated rules, false-positive boundaries, native Mihomo
control-domain fake-IP exclusion and actual DIRECT fixture responses. Real
acceptance requires both VPNs active, Tailscale reporting
`Running` and online, and a request to an authorized peer. A successful HTTP
request to a public Tailscale endpoint alone is insufficient.

Sources:

- [Tailscale with other VPNs](https://tailscale.com/docs/reference/faq/other-vpns)
- [Tailscale firewall bypass and DNS guidance](https://tailscale.com/docs/integrations/firewalls)
- [Mihomo TUN routing exclusions](https://wiki.metacubex.one/config/inbound/tun/#route-exclude-address)
- [Public Tailscale Funnel URLs](https://tailscale.com/docs/features/tailscale-funnel#resolving-the-funnel-url-to-an-ip-address)
