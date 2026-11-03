# November 2026 CN geographical baseline review

Reviewed on 2026-11-03 against the preceding October DB-IP baseline. Source: [DB-IP IP to Country Lite](https://db-ip.com/db/download/ip-to-country-lite), November CSV, 732,796 records, official uncompressed SHA-1 `e2061015c43ec91c94a12191a6a613279eb94c0c`. Compressed/uncompressed SHA-256 and lengths are pinned in `country-source.json`.

The generator selects 9,975 exact geographical CN ranges and normalizes them to 15,189 CIDRs: 8,161 IPv4 and 7,028 IPv6 (previous total15,365). Relative IPv4 coverage adds230 ranges /383,891 addresses and removes450 ranges /378,194 addresses. IPv6 coverage adds99 ranges and removes158; exact ranges and precision-preserving address counts are recorded in `country-review.json`. No ASN-wide or registered-country exceptions were introduced.

Existing positive Chinese cloud/DNS samples and negative foreign/AI/CDN samples pass the generator's checks. Source changes include `17.243.160.0/21` becoming CN, `1.91.64.0/18` becoming US and `43.97.0.0/17` becoming SG in this edition. These are vendor geographical estimates, not independently proven connectivity or a reason to override explicit domestic, Apple, AI or foreign domain rules. Keep domain precedence and manual unknown-traffic control.

Native compile/decompile/recompile bytes agree. The domain source remains separately pinned at SagerNet `a9958574`; the new bundle packaging date does not imply a refreshed domain source. `COUNTRY-REVIEW.md` retains the historical October source-migration narrative; its old baseline hashes do not describe the current monthly difference.
