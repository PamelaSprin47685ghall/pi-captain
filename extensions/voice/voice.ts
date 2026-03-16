/**
 * Core recording flow: dependency checks, device resolution, and transcription.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { listAudioDevices, preferredDevice, recordAudio } from "./audio.js";
import { loadConfig, saveConfig, type VoiceConfig } from "./config.js";
import {
	ensureModel,
	findExecutable,
	findWhisperBin,
	MODEL_FILE,
	transcribe,
} from "./model.js";
import { showRecordingOverlay } from "./overlay.js";

/** Returns false and notifies if any dependency is missing. */
async function ensureReadyToRecord(ctx: ExtensionContext): Promise<boolean> {
	if (!ctx.hasUI) {
		ctx.ui.notify("voice requires interactive mode", "error");
		return false;
	}
	if (!findExecutable(["ffmpeg"])) {
		ctx.ui.notify("🎙 ffmpeg not found — run: brew install ffmpeg", "error");
		return false;
	}
	if (!findWhisperBin()) {
		ctx.ui.notify(
			"🎙 whisper-cpp not found — run: brew install whisper-cpp",
			"error",
		);
		return false;
	}
	if (!fs.existsSync(MODEL_FILE)) {
		ctx.ui.setStatus(
			"voice",
			ctx.ui.theme.fg("warning", "🎙 downloading model…"),
		);
		try {
			await ensureModel();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			ctx.ui.notify(`🎙 Model download failed: ${msg}`, "error");
			ctx.ui.setStatus("voice", undefined);
			return false;
		}
		ctx.ui.setStatus("voice", undefined);
	}
	return true;
}

/** Resolves or auto-detects + persists the audio device config. */
async function resolveConfig(
	ctx: ExtensionContext,
): Promise<VoiceConfig | null> {
	const cfg = loadConfig();
	if (cfg) return cfg;
	const devices = await listAudioDevices();
	const best = preferredDevice(devices);
	if (!best) {
		ctx.ui.notify("🎙 No audio devices found. Is ffmpeg installed?", "error");
		return null;
	}
	const newCfg: VoiceConfig = {
		audioDevice: `:${best.index}`,
		deviceName: best.name,
	};
	saveConfig(newCfg);
	ctx.ui.notify(`🎙 Using: ${best.name}  (run /voice-setup to change)`, "info");
	return newCfg;
}

interface TranscriptionOpts {
	pi: ExtensionAPI;
	ctx: ExtensionContext;
	audioFile: string;
}

/** Transcribes audioFile and sends the text or notifies of issues. */
async function handleTranscription({
	pi,
	ctx,
	audioFile,
}: TranscriptionOpts): Promise<void> {
	ctx.ui.setStatus("voice", ctx.ui.theme.fg("warning", "🎙 transcribing…"));
	try {
		if (!fs.existsSync(audioFile) || fs.statSync(audioFile).size < 1024) {
			ctx.ui.notify("🎙 Recording too short or empty", "warning");
			return;
		}
		const text = await transcribe(audioFile);
		if (!text.trim()) {
			ctx.ui.notify(
				"🎙 Nothing recognized — try speaking more clearly",
				"warning",
			);
		} else {
			pi.sendUserMessage(text);
		}
	} catch (e) {
		const raw = e instanceof Error ? e.message : String(e);
		ctx.ui.notify(
			`🎙 Transcription failed: ${raw.split("\n")[0] ?? raw}`,
			"error",
		);
	} finally {
		try {
			fs.unlinkSync(audioFile);
		} catch {
			/* ignore cleanup errors */
		}
		ctx.ui.setStatus("voice", undefined);
	}
}

export async function runVoiceOverlay(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<void> {
	if (!(await ensureReadyToRecord(ctx))) return;
	const cfg = await resolveConfig(ctx);
	if (!cfg) return;

	const audioFile = path.join(os.tmpdir(), `pi_voice_${Date.now()}.wav`);
	const ffmpegProc = recordAudio({
		device: cfg.audioDevice,
		outFile: audioFile,
	});
	const ffmpegExited = new Promise<void>((resolve) => {
		ffmpegProc.on("close", () => resolve());
	});

	const result = await showRecordingOverlay(ctx, cfg.deviceName);
	try {
		ffmpegProc.kill("SIGINT");
	} catch {
		/* already exited */
	}

	if (result === "cancel") {
		await Promise.race([ffmpegExited, new Promise((r) => setTimeout(r, 1000))]);
		try {
			fs.unlinkSync(audioFile);
		} catch {
			/* ignore */
		}
		ctx.ui.notify("🎙 Recording cancelled", "info");
		return;
	}

	await Promise.race([ffmpegExited, new Promise((r) => setTimeout(r, 5000))]);
	await handleTranscription({ pi, ctx, audioFile });
}
