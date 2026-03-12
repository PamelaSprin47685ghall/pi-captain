import { describe, expect, test } from "bun:test";
import {
	flushPendingList,
	parseFrontmatter,
	parseKeyValue,
	parseListItem,
	parseScalarValue,
} from "./frontmatter.js";

// ── parseListItem ─────────────────────────────────────────────────────────

describe("parseListItem", () => {
	test("matches standard YAML list item", () =>
		expect(parseListItem("  - foo")).toBe("foo"));
	test("trims surrounding whitespace", () =>
		expect(parseListItem("  -   bar  ")).toBe("bar"));
	test("returns null for non-list line", () =>
		expect(parseListItem("key: val")).toBeNull());
	test("returns null for empty string", () =>
		expect(parseListItem("")).toBeNull());
});

// ── parseScalarValue ──────────────────────────────────────────────────────

describe("parseScalarValue", () => {
	test("'true' → boolean true", () =>
		expect(parseScalarValue("true")).toBe(true));
	test("'false' → boolean false", () =>
		expect(parseScalarValue("false")).toBe(false));
	test("integer string → number", () =>
		expect(parseScalarValue("42")).toBe(42));
	test("float string → number", () =>
		expect(parseScalarValue("3.14")).toBe(3.14));
	test("negative number", () => expect(parseScalarValue("-7")).toBe(-7));
	test("comma-separated → string[]", () =>
		expect(parseScalarValue("a, b, c")).toEqual(["a", "b", "c"]));
	test("plain string → string", () =>
		expect(parseScalarValue("hello")).toBe("hello"));
});

// ── flushPendingList ──────────────────────────────────────────────────────

describe("flushPendingList", () => {
	test("writes list into result under key", () => {
		const result: Record<string, string | string[] | number | boolean> = {};
		flushPendingList(result, "items", ["x", "y"]);
		expect(result.items).toEqual(["x", "y"]);
	});

	test("no-ops when listItems is null", () => {
		const result: Record<string, string | string[] | number | boolean> = {};
		flushPendingList(result, "items", null);
		expect(result.items).toBeUndefined();
	});
});

// ── parseKeyValue ─────────────────────────────────────────────────────────

describe("parseKeyValue", () => {
	test("parses simple key: value", () => {
		const result: Record<string, string | string[] | number | boolean> = {};
		const key = parseKeyValue("name: Claude", result);
		expect(key).toBe("name");
		expect(result.name).toBe("Claude");
	});

	test("strips surrounding quotes", () => {
		const result: Record<string, string | string[] | number | boolean> = {};
		parseKeyValue('title: "My Title"', result);
		expect(result.title).toBe("My Title");
	});

	test("returns null for non-key-value line", () => {
		const r: Record<string, string | string[] | number | boolean> = {};
		expect(parseKeyValue("  - item", r)).toBeNull();
	});

	test("returns key with empty value for bare key (YAML list header)", () => {
		const result: Record<string, string | string[] | number | boolean> = {};
		const key = parseKeyValue("tools:", result);
		expect(key).toBe("tools");
		expect(result.tools).toBeUndefined(); // empty value not written
	});
});

// ── parseFrontmatter ──────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
	test("parses scalar values", () => {
		const result = parseFrontmatter("name: Claude\nversion: 2\nenabled: true");
		expect(result.name).toBe("Claude");
		expect(result.version).toBe(2);
		expect(result.enabled).toBe(true);
	});

	test("parses YAML list syntax", () => {
		const result = parseFrontmatter("tools:\n  - read\n  - write");
		expect(result.tools).toEqual(["read", "write"]);
	});

	test("parses comma-separated list", () => {
		const result = parseFrontmatter("tags: a, b, c");
		expect(result.tags).toEqual(["a", "b", "c"]);
	});

	test("handles multiple keys", () => {
		const result = parseFrontmatter("a: 1\nb: hello\nc: false");
		expect(result).toMatchObject({ a: 1, b: "hello", c: false });
	});

	test("returns empty object for empty string", () => {
		expect(parseFrontmatter("")).toEqual({});
	});
});
