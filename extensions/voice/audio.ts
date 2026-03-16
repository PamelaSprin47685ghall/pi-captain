/**
 * Audio device detection and recording helpers (ffmpeg/avfoundation).
 */

import { spawn } from "node:child_process";

export interface AudioDevice {
	index: number;
	name: string;
}

export interface RecordAudioOpts {
	device: string;
	outFile: string;
	maxSeconds?: number;
}

function parseAudioDevices(stderr: string): AudioDevice[] {
	const devices: AudioDevice[] = [];
	let inAudioSection = false;
	for (const line of stderr.split("\n")) {
		if (line.includes("AVFoundation audio devices")) {
			inAudioSection = true;
			continue;
		}
		if (!inAudioSection) continue;
		const m = line.match(/\[(\d+)\]\s+(.+)/);
		if (m)
			devices.push({
				index: parseInt(m[1] ?? "0", 10),
				name: (m[2] ?? "").trim(),
			});
	}
	return devices;
}

export async function listAudioDevices(): Promise<AudioDevice[]> {
	return new Promise((resolve) => {
		const proc = spawn(
			"ffmpeg",
			["-f", "avfoundation", "-list_devices", "true", "-i", ""],
			{ stdio: ["ignore", "ignore", "pipe"] },
		);
		let stderr = "";
		proc.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		proc.on("close", () => resolve(parseAudioDevices(stderr)));
	});
}

export function preferredDevice(
	devices: AudioDevice[],
): AudioDevice | undefined {
	const keywords = ["macbook", "built-in", "internal", "microphone"];
	return (
		devices.find((d) =>
			keywords.some((k) => d.name.toLowerCase().includes(k)),
		) ?? devices[0]
	);
}

export function recordAudio({
	device,
	outFile,
	maxSeconds = 120,
}: RecordAudioOpts) {
	return spawn(
		"ffmpeg",
		[
			"-y",
			"-f",
			"avfoundation",
			"-i",
			device,
			"-ar",
			"16000",
			"-ac",
			"1",
			"-t",
			String(maxSeconds),
			outFile,
		],
		{ stdio: ["ignore", "ignore", "pipe"] },
	);
}
