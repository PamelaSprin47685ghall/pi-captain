// ── Dependency-cruiser: FC/IS Layer Boundary Rules ───────────────────────
// Enforces the Functional Core / Imperative Shell architecture.
// Run: bunx depcruise --config .dependency-cruiser.cjs extensions/captain
// Docs: https://github.com/sverweij/dependency-cruiser

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		// ── Core purity rules ─────────────────────────────────────────────
		{
			name: "core-no-infra",
			comment:
				"The pure core must never import from infra/ (side-effectful adapters). " +
				"Move any I/O behind a Port interface in core/ports.ts.",
			severity: "error",
			from: { path: "^extensions/captain/core/" },
			to:   { path: "^extensions/captain/infra/" },
		},
		{
			name: "core-no-shell",
			comment:
				"The pure core must never import from shell/ (coordinators). " +
				"Pure functions take data in, return data out — no orchestration.",
			severity: "error",
			from: { path: "^extensions/captain/core/" },
			to:   { path: "^extensions/captain/shell/" },
		},
		{
			name: "core-no-composition",
			comment:
				"Core must not import from composition/ (impure pipeline runners).",
			severity: "error",
			from: { path: "^extensions/captain/core/" },
			to:   { path: "^extensions/captain/composition/" },
		},
		{
			name: "core-no-steps",
			comment:
				"Core must not import from steps/ (SDK-calling session runners).",
			severity: "error",
			from: { path: "^extensions/captain/core/" },
			to:   { path: "^extensions/captain/steps/" },
		},

		// ── Infra isolation rules ─────────────────────────────────────────
		{
			name: "infra-no-shell",
			comment:
				"Infra adapters must not depend on the shell layer. " +
				"Infra implements Ports; the shell wires everything together.",
			severity: "error",
			from: { path: "^extensions/captain/infra/" },
			to:   { path: "^extensions/captain/shell/" },
		},
		{
			name: "infra-no-steps",
			comment: "Infra must not import from steps/ (shell-level orchestration).",
			severity: "error",
			from: { path: "^extensions/captain/infra/" },
			to:   { path: "^extensions/captain/steps/" },
		},
		{
			name: "infra-no-composition",
			comment: "Infra must not import from composition/ (shell-level orchestration).",
			severity: "error",
			from: { path: "^extensions/captain/infra/" },
			to:   { path: "^extensions/captain/composition/" },
		},
	],

	options: {
		doNotFollow: {
			path: "node_modules|\\.tsbuild|\\.d\\.ts$",
		},
		tsPreCompilationDeps: true,
		moduleSystems: ["es6"],
		reporterOptions: {
			text: {
				highlightFocused: true,
			},
		},
	},
};
