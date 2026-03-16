/**
 * Whisper model management (download) and transcription via whisper-cpp.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const MODEL_DIR = path.join(os.homedir(), ".pi", "voice-models");
export const MODEL_FILE = path.join(MODEL_DIR, "ggml-base.en.bin");
const MODEL_URL =
	"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";

// ── Dependency helpers ────────────────────────────────────────────────────────

export function findExecutable(names: string[]): string | null {
	for (const name of names) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: dynamic require for spawnSync
			const r = (require("node:child_process") as any).spawnSync(
				"which",
				[name],
				{ encoding: "utf-8" },
			);
			if (r.status === 0 && r.stdout.trim()) return name;
		} catch {
			// binary not found, try next
		}
	}
	return null;
}

let whisperBin: string | null = null;

export function findWhisperBin(): string | null {
	if (whisperBin) return whisperBin;
	whisperBin = findExecutable(["whisper-cli", "whisper-cpp", "whisper"]);
	return whisperBin;
}

// ── Model download ────────────────────────────────────────────────────────────

let modelDownloading = false;
let modelReady = false;

export async function ensureModel(
	onProgress?: (msg: string) => void,
): Promise<void> {
	if (modelReady || fs.existsSync(MODEL_FILE)) {
		modelReady = true;
		return;
	}
	if (modelDownloading) {
		while (modelDownloading) {
			await new Promise((r) => setTimeout(r, 500));
		}
		return;
	}

	fs.mkdirSync(MODEL_DIR, { recursive: true });
	modelDownloading = true;
	onProgress?.(
		"🎙 Downloading Whisper base.en model (~150 MB, first run only)…",
	);

	try {
		await new Promise<void>((resolve, reject) => {
			const tmpFile = `${MODEL_FILE}.tmp`;
			const proc = spawn(
				"curl",
				[
					"-L",
					"--retry",
					"5",
					"--retry-delay",
					"2",
					"-C",
					"-",
					"-o",
					tmpFile,
					MODEL_URL,
				],
				{ stdio: ["ignore", "ignore", "pipe"] },
			);
			proc.on("close", (code) => {
				if (code === 0) {
					fs.renameSync(tmpFile, MODEL_FILE);
					resolve();
				} else {
					try {
						fs.unlinkSync(tmpFile);
					} catch {
						// ignore cleanup error
					}
					reject(new Error(`curl exited with code ${code}`));
				}
			});
			proc.on("error", reject);
		});
		modelReady = true;
	} finally {
		modelDownloading = false;
	}
}

// ── Transcription ─────────────────────────────────────────────────────────────

const SILENCE_HALLUCINATIONS = new Set([
	"you",
	"bye",
	"thank you",
	"thanks",
	".",
]);

export async function transcribe(audioFile: string): Promise<string> {
	const bin = findWhisperBin();
	if (!bin)
		throw new Error("whisper-cpp not found — run: brew install whisper-cpp");

	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const proc = spawn(
			bin,
			["-m", MODEL_FILE, "-f", audioFile, "-nt", "-np", "-l", "auto"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);

		proc.stdout.on("data", (d: Buffer) => {
			stdout += d.toString("utf-8");
		});
		proc.stderr.on("data", (d: Buffer) => {
			stderr += d.toString("utf-8");
		});

		proc.on("close", (code, signal) => {
			if (code === 0) {
				const text = stdout
					.split("\n")
					.map((l) => l.trim())
					.filter((l) => l && !l.startsWith("[") && !l.endsWith("]"))
					.join(" ")
					.trim();
				resolve(SILENCE_HALLUCINATIONS.has(text.toLowerCase()) ? "" : text);
			} else {
				const detail =
					stderr.trim() ||
					(signal ? `killed by signal ${signal}` : `exited with code ${code}`);
				reject(new Error(detail));
			}
		});
		proc.on("error", reject);
	});
}
