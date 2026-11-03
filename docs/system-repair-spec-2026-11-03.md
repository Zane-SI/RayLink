# System audit repair and network qualification

Baseline: `230470f`, the source inspected in `system-audit-2026-11-03.md`.

The user authorizes repairing the audit findings, with particular attention to stability, latency and routing. Use existing MCP HTTP, store, subscription-generation and native-client test boundaries; preserve current users, quotas, seven original entries, CDN identity/TLS, and AI residential credentials. Keep the user's active client profile and selections unchanged.

Required changes:

1. Upgrade affected production dependencies with a locked reproducible install. Bound MCP input elements, node scopes and advanced JSON depth before business dispatch; retain authentication, revocation, concurrency, idempotency and role/scopes.
2. Create and reopen SQLite DB/WAL/SHM with owner-only access. Preserve data and support in-memory test stores. Use per-file protection; a global service umask must not make shared Caddy configuration unreadable.
3. Correct stale Google residential DNS assertions. Adapt native provider discovery/health verification to current Mihomo without weakening real payload, authorization or failover checks. Include CDN authentication/accounting in production acceptance and test approved old/new Mihomo versions.
4. Use independent domestic DNS providers for smart Mihomo subscriptions and relevant domestic policies/endpoint bootstrap. Avoid speculative foreign fallback DNS queries when domestic answers are valid. Retain local/private DNS, explicit AI/foreign rules, domestic address filtering, cache and actual fallback on error.
5. Review and pin the November CN geolocation candidate, preserving source/license/checksums, exact foreign holes and native/inline equivalence. Keep domain data separately pinned and report source ages honestly.
6. Add a disk warning at 80%, retaining a single critical alert at 90%. Provide explicit host log maintenance with bounded journal/rsyslog retention, prior config records, validation and low-priority archive compression. Do not delete deployment backups or unrelated directories.
7. Explain that client-persisted manual AI choices bypass automatic fallback; distinguish transport probes, business HTTP evidence and native application acceptance. Keep the compact group layout and AI-only residential boundary.

Acceptance: focused regressions; complete unit/API suite; supported native protocol, traffic, DNS, routing, health/failover, AI HTTP/HTTPS/SOCKS5, CDN, idle WS and memory gates. Compare complete old/new subscriptions through isolated physical-interface clients; report HTTP 401/challenge separately from authenticated application success. Qualify production source/dependencies and TLS before restarting only the control plane; verify original Runtime/CDN/Caddy configuration hashes and PIDs, database integrity, permissions and auth gates afterward.

App Store, ChatGPT and Tailscale native-client incidents remain open until actual app evidence is obtained. Current macOS GUI permissions are pending; do not infer app success from CLI responses or alter permissions automatically. The earlier failing Wi-Fi is unavailable, so CDN acceptance on that network remains unverified. Do not silently change the AI public IP or active Mac configuration.
