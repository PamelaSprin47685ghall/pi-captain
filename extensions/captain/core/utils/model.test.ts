import { describe, expect, test } from "bun:test";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistryLike } from "./model.js";
import { resolveModel } from "./model.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function model(id: string, provider = "anthropic"): Model<Api> {
	return { id, provider, name: id } as unknown as Model<Api>;
}

function registry(models: Model<Api>[]): ModelRegistryLike {
	return {
		getAll: () => models,
		find: (provider, id) =>
			models.find((m) => m.provider === provider && m.id === id),
		getApiKey: async () => undefined,
	};
}

const sonnet45 = model("claude-sonnet-4-5");
const sonnetDated = model("claude-sonnet-4-5-20250929");
const sonnetLegacy = model("claude-3-7-sonnet-latest");
const sonnetOldDated = model("claude-3-5-sonnet-20240620");
const fallback = model("claude-sonnet-4-5");

// ── resolveModel ──────────────────────────────────────────────────────────

describe("resolveModel", () => {
	test("exact id match within same provider", () => {
		const reg = registry([sonnet45, sonnetDated]);
		const result = resolveModel("claude-sonnet-4-5", reg, fallback);
		expect(result.id).toBe("claude-sonnet-4-5");
	});

	test("partial match prefers new-style undated alias", () => {
		const reg = registry([sonnetOldDated, sonnetDated, sonnet45, sonnetLegacy]);
		const result = resolveModel("sonnet", reg, fallback);
		expect(result.id).toBe("claude-sonnet-4-5");
	});

	test("partial match prefers new-style dated over legacy", () => {
		const reg = registry([sonnetOldDated, sonnetLegacy, sonnetDated]);
		const result = resolveModel("sonnet", reg, fallback);
		expect(result.id).toBe("claude-sonnet-4-5-20250929");
	});

	test("prefers same provider over cross-provider", () => {
		const bedrockModel = model("claude-sonnet-4-5", "bedrock");
		const reg = registry([bedrockModel, sonnet45]);
		const result = resolveModel("claude-sonnet-4-5", reg, fallback);
		expect(result.provider).toBe("anthropic");
	});

	test("falls back to session model when no match found", () => {
		const reg = registry([model("gpt-4", "openai")]);
		const result = resolveModel("sonnet", reg, fallback);
		expect(result).toBe(fallback);
	});

	test("falls back when registry is empty", () => {
		const result = resolveModel("sonnet", registry([]), fallback);
		expect(result).toBe(fallback);
	});
});
