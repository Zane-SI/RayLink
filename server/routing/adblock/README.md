# Reviewed advertising rule bundle

RayLink adapts only the `DOMAIN-SUFFIX` entries from Johnshall's
`sr_ad_only.conf`. The upstream snapshot and every generated artifact are
pinned by SHA-256 in `manifest.json`. All 128 upstream `IP-CIDR` rules (125
networks after normalization) are deliberately excluded because blocking
shared addresses can break unrelated domestic applications and CDN traffic.

The generated files serve three full-profile clients without embedding 58,417
rules in every subscription:

- `adblock-johnshall.srs` for sing-box;
- `adblock-johnshall.mrs` for compatible external consumers; RayLink's complete
  Mihomo subscriptions embed the verified domain baseline so cold startup does
  not depend on an HTTP provider download;
- `adblock-johnshall-egern.yaml` for Egern.

`adblock-johnshall.json` is the verified offline fallback and the source for
inline profiles used when the control-plane certificate cannot be trusted by a
client-side rule downloader.

To prepare a reviewed update, run the builder into a new empty directory with
the approved sing-box 1.14.2 and a current Mihomo binary. Review upstream
changes and false positives before replacing this directory. Do not change the
pinned commit, checksum, or expected counts only to make an unreviewed build
pass.

```sh
SING_BOX_BIN=/path/to/raylink-sing-box \
MIHOMO_BIN=/path/to/mihomo \
node server/routing/adblock/build.mjs /tmp/raylink-adblock-candidate
```

Source: <https://github.com/Johnshall/Shadowrocket-ADBlock-Rules-Forever>

License: Creative Commons Attribution-ShareAlike 4.0 International. See
`LICENSE` for the retained upstream notice.
