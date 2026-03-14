import { basename, resolve } from "node:path";

// ── Path classification types ──────────────────────────────────────────────────────

export type PathAction = "block" | "confirm" | "allow";

// ── Regex patterns ────────────────────────────────────────────────────────────────

// Patterns for directory-based protection
export const GIT_DIR = /(?:^|[/\\])\.git(?:[/\\]|$)/;
export const NODE_MODULES = /(?:^|[/\\])node_modules(?:[/\\]|$)/;

// Regex to find .git/ and node_modules/ references in bash commands
export const GIT_REF_RE =
	/(^|[^A-Za-z0-9._-])(\.git(?:[/\\][^\s]*)?)(\s|$|[;&|<>])/g;
export const NODE_MODULES_REF_RE =
	/(^|[^A-Za-z0-9._-])(node_modules(?:[/\\][^\s]*)?)(\s|$|[;&|<>])/g;
export const ENV_REF_RE = /(?:^|\s)(\.env(?:\.\w+)?)(?:\s|$|[;&|<>])/g;

// node_modules sub-paths explicitly allowed for reads (e.g. browsing pi API docs/types)
export const ALLOWED_READ_NODE_MODULES =
	/(?:^|[/\\])node_modules[/\\]@mariozechner[/\\]/;

// Read-only bash commands that shouldn't trigger write protection
export const READ_ONLY_COMMANDS =
	/^\s*(cat|less|more|head|tail|grep|rg|ag|find|ls|tree|file|stat|wc|diff)\b/;

// ── File and directory lists ──────────────────────────────────────────────────────

// Sensitive filenames (block writes)
export const SENSITIVE_FILES = new Set([
	".env",
	".env.local",
	".env.development",
	".env.production",
	".env.staging",
	".env.test",
]);

// Files requiring confirmation before write
export const CONFIRM_WRITE_FILES = new Set([
	"package-lock.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"bun.lock",
	"bun.lockb",
	"Gemfile.lock",
	"poetry.lock",
	"Cargo.lock",
	"go.sum",
	"composer.lock",
	"Dockerfile",
	"docker-compose.yml",
	"docker-compose.yaml",
	".gitlab-ci.yml",
]);

// Directory patterns requiring confirmation before write
export const CONFIRM_WRITE_DIRS = [
	/(?:^|[/\\])\.github[/\\]workflows[/\\]/,
	/(?:^|[/\\])\.circleci[/\\]/,
];

// ── Classification functions ──────────────────────────────────────────────────────

/** Classify a file path for write operations */
export function classifyWritePath(filePath: string): {
	action: PathAction;
	reason: string;
} {
	const resolved = resolve(filePath);
	const name = basename(filePath);

	// .git/ - always block (read and write)
	if (GIT_DIR.test(resolved)) {
		return {
			action: "block",
			reason: ".git/ is protected to prevent repository corruption",
		};
	}

	// node_modules/ - block writes
	if (NODE_MODULES.test(resolved)) {
		return {
			action: "block",
			reason: "node_modules/ is protected - use your package manager",
		};
	}

	// .env files - block writes
	if (SENSITIVE_FILES.has(name)) {
		return {
			action: "block",
			reason: `${name} contains secrets and cannot be modified by the agent`,
		};
	}

	// Lock files and CI configs - confirm
	if (CONFIRM_WRITE_FILES.has(name)) {
		return {
			action: "confirm",
			reason: `${name} is a managed file - confirm before editing`,
		};
	}
	for (const pat of CONFIRM_WRITE_DIRS) {
		if (pat.test(resolved)) {
			return {
				action: "confirm",
				reason: "CI/CD configuration - confirm before editing",
			};
		}
	}

	return { action: "allow", reason: "" };
}

/** Classify a file path for read operations (more permissive) */
export function classifyReadPath(filePath: string): {
	action: PathAction;
	reason: string;
} {
	const resolved = resolve(filePath);

	// Explicitly allow reading @mariozechner packages — quick API/type/doc lookup
	if (ALLOWED_READ_NODE_MODULES.test(resolved)) {
		return { action: "allow", reason: "" };
	}

	// Only .git/ internals are blocked for reads
	if (GIT_DIR.test(resolved)) {
		return {
			action: "block",
			reason: ".git/ is protected to prevent repository corruption",
		};
	}

	return { action: "allow", reason: "" };
}

/** Extract potentially protected path references from a bash command */
export function extractProtectedRefs(command: string): string[] {
	const refs = new Set<string>();

	// Reset regex lastIndex
	GIT_REF_RE.lastIndex = 0;
	NODE_MODULES_REF_RE.lastIndex = 0;
	ENV_REF_RE.lastIndex = 0;

	// Search for git references
	let match = GIT_REF_RE.exec(command);
	while (match !== null) {
		if (match[2]) refs.add(match[2]);
		match = GIT_REF_RE.exec(command);
	}

	// Search for node_modules references (skip explicitly allowed sub-paths)
	match = NODE_MODULES_REF_RE.exec(command);
	while (match !== null) {
		if (match[2] && !ALLOWED_READ_NODE_MODULES.test(match[2])) {
			refs.add(match[2]);
		}
		match = NODE_MODULES_REF_RE.exec(command);
	}

	// Search for env references
	match = ENV_REF_RE.exec(command);
	while (match !== null) {
		if (match[1]) refs.add(match[1]);
		match = ENV_REF_RE.exec(command);
	}

	return Array.from(refs);
}
