# App Store smart routing

Smart subscriptions keep `apps.apple.com`, `itunes.apple.com`, `mzstatic.com`
and their subdomains on DIRECT with domestic DNS. The exact Apple Account hosts
`gsa.apple.com`, `idmsa.apple.com`, `account.apple.com` and
`appleid.cdn-apple.com` follow the same path. Previously geographic rules sent
catalog/image requests directly while account and purchase requests could
fall through to the unclassified proxy selector.

The scope follows Apple's [network requirements](https://support.apple.com/en-us/101555),
specifically **Apps and additional content** and **Apple Account**. This is a
local routing policy; Apple does not require all users to use DIRECT. The
policy assumes these endpoints work on the user's local network, as confirmed
in this incident when the user disabled the subscription.

Priority is local infrastructure, explicit administrator rules, Store rules,
managed AI rules, generic ad blocking, then geographic rules and the manual
unclassified selector. DNS honors explicit domain overrides before Store
defaults. Global-proxy and direct modes retain their explicit behavior. This
does not introduce an all-Apple, iCloud, IP-range or process-wide bypass.

This policy is shared by diagnostics and the full sing-box, Mihomo, Mihomo
Modern and Egern subscriptions. Loon/Egern node-only exports contain nodes,
so they do not install routing policies. Existing nodes, credentials and client
choices are preserved. Refresh the complete subscription to receive the rules.

## Verification

- `node --test tests/app-store-routing.test.js` covers exports, rule priority,
  scoped matching, DNS alignment, custom overrides and explicit modes.
- `node tests/unified-client-routing-check.mjs` exercises exported Mihomo and
  Mihomo Modern profiles using isolated native DNS/HTTP fixtures. It checks
  actual Store response delivery, matching rules and DIRECT chains while the
  ordinary and unknown groups select a proxy.
- In the real client, check catalog/search and an actual image request, then
  the matching rule and chain for account/purchase hosts. Authentication
  endpoint TLS or HTTP 401 alone does not prove login, purchases or downloads.
- Confirm the App Store Discover/search page on the affected Mac. Automated
  API tests do not prove that the native application has recovered.
