/**
 * Voice input extension — speak instead of type.
 * Usage: /voice | /voice-setup | Ctrl+Shift+V
 * Requires: brew install ffmpeg whisper-cpp
 */

import * as fs from "node:fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { listAudioDevices } from "./audio.js";
import { saveConfig } from "./config.js";
import {
	ensureModel,
	findExecutable,
	findWhisperBin,
	MODEL_FILE,
} from "./model.js";
import { runVoiceOverlay } from "./voice.js";

export default function (pi: ExtensionAPI) {
	// Warm model in background on session start
	pi.on("session_start", async (_e, ctx) => {
		if (!findExecutable(["ffmpeg"])) {
			ctx.ui.notify(
				"🎙 Voice: ffmpeg not found — run: brew install ffmpeg",
				"warning",
			);
			return;
		}
		if (!findWhisperBin()) {
			ctx.ui.notify(
				"🎙 Voice: whisper-cpp not found — run: brew install whisper-cpp",
				"warning",
			);
			return;
		}
		if (!fs.existsSync(MODEL_FILE)) {
			ctx.ui.setStatus("voice", ctx.ui.theme.fg("dim", "🎙 downloading model…"));
			try {
				await ensureModel();
				ctx.ui.setStatus("voice", ctx.ui.theme.fg("success", "🎙 voice ready"));
				setTimeout(() => ctx.ui.setStatus("voice", undefined), 3000);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				ctx.ui.setStatus(
					"voice",
					ctx.ui.theme.fg("error", "🎙 model download failed"),
				);
				ctx.ui.notify(`🎙 Model download failed: ${msg}`, "error");
			}
		}
	});

	pi.registerCommand("voice", {
		description:
			"Record voice and transcribe to editor (on-device via whisper-cpp)",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			await runVoiceOverlay(pi, ctx);
		},
	});

	pi.registerShortcut("ctrl+shift+v", {
		description: "Voice input — record and transcribe",
		handler: async (ctx) => {
			await runVoiceOverlay(pi, ctx);
		},
	});

	pi.registerCommand("voice-setup", {
		description: "Select microphone device for voice input",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("voice-setup requires interactive mode", "error");
				return;
			}
			ctx.ui.setStatus("voice", ctx.ui.theme.fg("dim", "🎙 detecting devices…"));
			const devices = await listAudioDevices();
			ctx.ui.setStatus("voice", undefined);

			if (devices.length === 0) {
				ctx.ui.notify(
					"🎙 No audio devices found. Is ffmpeg installed?",
					"error",
				);
				return;
			}
			const labels = devices.map((d) => `[${d.index}] ${d.name}`);
			const chosen = await ctx.ui.select("Select microphone", labels);
			if (!chosen) return;

			const dev = devices.find((d) => chosen === `[${d.index}] ${d.name}`);
			if (!dev) return;

			saveConfig({ audioDevice: `:${dev.index}`, deviceName: dev.name });
			ctx.ui.notify(`🎙 Saved: ${dev.name}`, "info");
		},
	});
}
