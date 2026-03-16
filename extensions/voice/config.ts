/** Voice extension configuration (persisted to ~/.pi/.voice-config.json). */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CONFIG_FILE = path.join(os.homedir(), ".pi", ".voice-config.json");

export interface VoiceConfig {
	audioDevice: string; // ffmpeg avfoundation device e.g. ":3"
	deviceName: string;
}

export function loadConfig(): VoiceConfig | null {
	try {
		return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as VoiceConfig;
	} catch {
		return null;
	}
}

export function saveConfig(cfg: VoiceConfig): void {
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
