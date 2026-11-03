// One stable check name gates all matrix variants and installation checks.
// Never treat skipped/cancelled/missing dependencies as a successful release.
const required = ["runtime", "production-check", "installation-check"];
let results;
try {
  results = JSON.parse(process.env.RAYLINK_REQUIRED_JOB_RESULTS || "");
} catch {
  console.error("Required CI job results are missing or invalid JSON.");
  process.exit(1);
}
if (!results || typeof results !== "object" || Array.isArray(results)
  || Object.keys(results).length !== required.length
  || !required.every((job) => Object.hasOwn(results, job) && results[job]?.result === "success")) {
  console.error("Runtime build, every production test variant, and installation/rollback must all succeed.");
  process.exit(1);
}
console.log("All required RayLink CI jobs succeeded.");
