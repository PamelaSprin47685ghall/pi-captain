// ─── State types and factory ──────────────────────────────────────────────

export interface RefactorPass {
	pass: number;
	change: string;
	reason: string;
	remaining: string;
	done: boolean;
}

export interface RefactorState {
	active: boolean;
	target: string;
	passes: RefactorPass[];
	maxPasses: number;
	testCommand: string; // Shell command to run tests after each pass
	autoCommit: boolean; // Whether to commit+push on completion
}

export function defaultState(): RefactorState {
	return {
		active: false,
		target: "",
		passes: [],
		maxPasses: 10,
		testCommand: "",
		autoCommit: true,
	};
}
