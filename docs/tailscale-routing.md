# Tailscale coexistence in smart subscriptions

The smart defaults send `tailscale.com` and its subdomains directly, using
domestic public DNS. Control-plane and DERP connections therefore do not depend
on the ordinary proxy or its unclassified selector. `ts.net` names use the local
Tailscale resolver `100.100.100.100:53`, not a public resolver or an AI upstream.
Explicit administrator domain rules retain priority.

Mihomo full profiles exclude both suffixes from fake-IP allocation. They also
provide `tun.route-exclude-address` for `100.64.0.0/10` and
`fd7a:115c:a1e0::/48` without enabling TUN, changing the stack, or choosing an
interface. Native sing-box TUN profiles exclude those mesh ranges too. Egern
full profiles receive matching domain/DNS rules; node-only exports do not
configure routing.

These are distinct protections: DIRECT is an outbound decision inside the
proxy, whereas TUN exclusion lets the operating system route to Tailscale.
Mihomo documents `route-exclude-address` as effective with native `auto-route`.
An app that manages macOS Network Extension routes itself must apply the
exclusions through its own integration. Presence of the YAML field does not
prove that a particular app installed the OS routes. No interface names,
tailnet names, exit nodes or per-device addresses are hard-coded.

When Tailscale is stopped, private MagicDNS lookups should fail locally. They
must not fall back to public DNS or a residential proxy. Public internet DNS
is unaffected. Custom advertised subnet routes still need exclusions in the
client; the subscription cannot infer them. Tailscale exit-node configurations
and platforms permitting only one active VPN need separate handling.

Validation covers generated rules, false-positive boundaries, native Mihomo
fake-IP exclusion, actual DIRECT fixture responses, and use of separate local
DNS fixtures. Real acceptance requires both VPNs active, Tailscale reporting
`Running` and online, and a request to an authorized peer. A successful HTTP
request to a public Tailscale endpoint alone is insufficient.

Sources:

- [Tailscale with other VPNs](https://tailscale.com/docs/reference/faq/other-vpns)
- [Tailscale firewall bypass and DNS guidance](https://tailscale.com/docs/integrations/firewalls)
- [Mihomo TUN routing exclusions](https://wiki.metacubex.one/config/inbound/tun/#route-exclude-address)
