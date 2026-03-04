// ── Steps Registry — re-exports all pipeline steps ───────────────────────
// Each step is an atomic unit that can be composed into pipelines.

// ── Original steps ────────────────────────────────────────────────────────
export { architecturePlan } from "./architecture-plan.js";
export { backendImplementation } from "./backend-implementation.js";
export { frontendImplementation } from "./frontend-implementation.js";
export { testStrategy } from "./test-strategy.js";
export { integrationTests } from "./integration-tests.js";
export { codeReview } from "./code-review.js";
export { research } from "./research.js";
export { summarize } from "./summarize.js";

// ── Bug Hunt steps ────────────────────────────────────────────────────────
export { reproduceBug } from "./reproduce-bug.js";
export { diagnoseBug } from "./diagnose-bug.js";
export { fixBug } from "./fix-bug.js";
export { verifyFix } from "./verify-fix.js";

// ── Refactor & Verify steps ──────────────────────────────────────────────
export { analyzeCodebase } from "./analyze-codebase.js";
export { refactorCode } from "./refactor-code.js";
export { writeRegressionTests } from "./write-regression-tests.js";

// ── PR Review steps ──────────────────────────────────────────────────────
export { securityAuditStep } from "./security-audit-step.js";
export { performanceReview } from "./performance-review.js";
export { qualityReview } from "./quality-review.js";
export { synthesizeReview } from "./synthesize-review.js";

// ── API Design steps ─────────────────────────────────────────────────────
export { apiDesignStep } from "./api-design-step.js";
export { apiImplementation } from "./api-implementation.js";
export { apiDocs } from "./api-docs.js";

// ── Migration Planner steps ──────────────────────────────────────────────
export { auditDependencies } from "./audit-dependencies.js";
export { migrationStrategy } from "./migration-strategy.js";
export { riskAssessment } from "./risk-assessment.js";

// ── Test Coverage Boost steps ────────────────────────────────────────────
export { coverageAnalysis } from "./coverage-analysis.js";
export { unitTestGen } from "./unit-test-gen.js";
export { edgeCaseGen } from "./edge-case-gen.js";

// ── Documentation Generation steps ──────────────────────────────────────
export { architectureDocs } from "./architecture-docs.js";
export { usageGuide } from "./usage-guide.js";
export { docsReview } from "./docs-review.js";

// ── Security Audit steps ─────────────────────────────────────────────────
export { dependencyScan } from "./dependency-scan.js";
export { owaspCheck } from "./owasp-check.js";
export { secretScan } from "./secret-scan.js";
export { authReview } from "./auth-review.js";
export { redTeamAssessment } from "./red-team-assessment.js";
export { securityReport } from "./security-report.js";
