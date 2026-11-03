# Stable required CI check

User request: fix main's two failed CI checks, unify check names, then enable required pre-merge CI only after tests pass.

Main baseline: `736f765` (failed Actions run `38260062795`). Both Node22 and24 fail the same CDN API fixture: the mock installer is paired with the real `SING_BOX_BIN`, so native publication tries fake certificate paths and returns500. The one-line fixture isolation fix already exists in `466abf6`, which is in open PR23 but not main. Native Runtime acceptance remains covered by separate real-binary checks.

The pre-task candidate `85c2266` already passed all six GitHub jobs on PR23. The current task adds a stable named aggregation check `RayLink CI`; matrix display names identify Node and Mihomo versions but are not bound directly to branch protection.

Requirements:

1. Preserve real protocol, traffic, DNS, health/failover, AI, CDN, memory and install/rollback acceptance; do not remove failing tests or use continue-on-error.
2. The final gate always runs after Runtime build, every production matrix variant and installation/rollback. It succeeds only if all dependency families explicitly succeeded. Failure, cancellation, skip, missing results, extra keys and malformed JSON block it.
3. Reproduce main's fixture failure with the native binary; prove the fixed candidate test passes with the same environment.
4. Run and inspect actual GitHub checks on the latest PR revision. Only after green, bind the active main ruleset to the exact stable check name from GitHub Actions (app15368), retaining force-push and deletion protection.
5. Merge PR23 at its tested exact head to repair main, then verify main's new run and active protection. Do not bypass the required check or alter production servers.

Review new CI changes against `85c2266`; existing PR23 product changes were requested, reviewed and deployed in the preceding work. Preserve their boundaries and the recorded pending native-App/old-Wi-Fi acceptance.

The first aggregation run (`41598160965`) correctly blocked on a native AI-upstream fixture startup failure in one matrix variant. Its generic error omitted the native cause. An OS port-reuse control reproduces the same startup symptom: closing each temporary listener allows the next allocation to reuse its port, giving two Runtime inbounds the same endpoint. Allocate distinct ports for the fixture process, retain native startup diagnostics, and cover actual listener binding under forced port reuse. The original CI event's exact cause remains unconfirmed because its native log was discarded; do not label a passing retry as proof of that cause. Rerun the complete native and GitHub matrix checks before enabling protection.
