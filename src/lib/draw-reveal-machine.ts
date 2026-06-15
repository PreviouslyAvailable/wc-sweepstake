export type RevealPhase =
  | "idle"
  | "blurring"
  | "stageIn"
  | "nameIn"
  | "nameDocked"
  | "card1Shake"
  | "card1Flip"
  | "card1Celebrate"
  | "card2Shake"
  | "card2Flip"
  | "card2Celebrate"
  | "awaitingNext"
  | "finale";

export interface RevealContext {
  phase: RevealPhase;
  participantIndex: number;
  skipped: boolean;
}

export type RevealEvent =
  | { type: "START" }
  | { type: "TICK" }
  | { type: "NEXT" }
  | { type: "SKIP" }
  | { type: "FINISH" }
  | { type: "RESET" };

export const REVEAL_SPEED = 0.5;

export const REVEAL_TIMING_MS: Partial<Record<RevealPhase, number>> = {
  blurring: 800,
  stageIn: 1200,
  nameIn: 2600,
  nameDocked: 1200,
  card1Shake: 700,
  card1Flip: 1600,
  card1Celebrate: 3000,
  card2Shake: 700,
  card2Flip: 1600,
  card2Celebrate: 3000,
  finale: 3000,
};

const PHASE_SEQUENCE: RevealPhase[] = [
  "blurring",
  "stageIn",
  "nameIn",
  "nameDocked",
  "card1Shake",
  "card1Flip",
  "card1Celebrate",
  "card2Shake",
  "card2Flip",
  "card2Celebrate",
  "awaitingNext",
];

const REDUCED_MOTION_SEQUENCE: RevealPhase[] = [
  "blurring",
  "stageIn",
  "nameIn",
  "nameDocked",
  "card1Flip",
  "card1Celebrate",
  "card2Flip",
  "card2Celebrate",
  "awaitingNext",
];

export function nextPhase(phase: RevealPhase, reducedMotion: boolean): RevealPhase {
  const sequence = reducedMotion ? REDUCED_MOTION_SEQUENCE : PHASE_SEQUENCE;
  const idx = sequence.indexOf(phase);
  if (idx === -1 || idx >= sequence.length - 1) return phase;
  return sequence[idx + 1];
}

export function revealReducer(
  state: RevealContext,
  event: RevealEvent,
  totalParticipants: number,
  reducedMotion: boolean
): RevealContext {
  switch (event.type) {
    case "START":
      return { phase: "blurring", participantIndex: 0, skipped: false };
    case "RESET":
      return { phase: "idle", participantIndex: 0, skipped: false };
    case "SKIP":
      return { ...state, phase: "awaitingNext", skipped: true };
    case "NEXT": {
      const nextIndex = state.participantIndex + 1;
      if (nextIndex >= totalParticipants) {
        return { ...state, phase: "finale", participantIndex: nextIndex };
      }
      return {
        phase: "stageIn",
        participantIndex: nextIndex,
        skipped: false,
      };
    }
    case "FINISH":
      return { ...state, phase: "idle" };
    case "TICK":
      if (state.phase === "awaitingNext" || state.phase === "idle" || state.phase === "finale") {
        return state;
      }
      return { ...state, phase: nextPhase(state.phase, reducedMotion) };
    default:
      return state;
  }
}

export function phaseLabel(phase: RevealPhase): string {
  switch (phase) {
    case "blurring":
      return "SETTING THE STAGE…";
    case "stageIn":
      return "SHUFFLING THE HAT…";
    case "nameIn":
    case "nameDocked":
      return "DRAWN FROM THE HAT";
    case "card1Shake":
    case "card1Flip":
    case "card1Celebrate":
      return "BAND B — WILDCARD";
    case "card2Shake":
    case "card2Flip":
    case "card2Celebrate":
      return "BAND A — CONTENDER";
    case "awaitingNext":
      return "ON RECORD";
    case "finale":
      return "DRAW COMPLETE";
    default:
      return "";
  }
}
