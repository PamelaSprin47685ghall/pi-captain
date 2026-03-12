import { describe, expect, test } from "bun:test";
import { text } from "./helpers.js";

describe("helpers: text", () => {
	test("wraps string in TextContent shape", () => {
		expect(text("hello")).toEqual({ type: "text", text: "hello" });
	});

	test("preserves empty string", () => {
		expect(text("")).toEqual({ type: "text", text: "" });
	});

	test("preserves special characters", () => {
		const s = "line1\nline2\t<tag>";
		expect(text(s).text).toBe(s);
	});

	test("type field is always 'text'", () => {
		expect(text("anything").type).toBe("text");
	});
});
