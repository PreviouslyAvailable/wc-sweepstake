"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  buildParticipantReveals,
  type DrawAssignment,
  type DrawPerson,
  type DrawTeam,
} from "@/lib/draw-order";
import {
  phaseLabel,
  revealReducer,
  REVEAL_TIMING_MS,
  type RevealPhase,
} from "@/lib/draw-reveal-machine";
import { confettiForTeam } from "@/lib/draw-confetti";
import { DrawCard } from "./DrawCard";

interface DrawRevealOverlayProps {
  assignments: DrawAssignment[];
  people: DrawPerson[];
  teams: DrawTeam[];
  participantOrder: string[];
  onComplete: () => void;
  onExit?: () => void;
}

const HAT_NAME_SLOTS = [
  { left: "18%", top: "10%" },
  { left: "62%", top: "20%" },
  { left: "34%", top: "34%" },
  { left: "72%", top: "44%" },
  { left: "24%", top: "58%" },
  { left: "54%", top: "68%" },
  { left: "40%", top: "18%" },
  { left: "12%", top: "42%" },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function DrawRevealOverlay({
  assignments,
  people,
  teams,
  participantOrder,
  onComplete,
  onExit,
}: DrawRevealOverlayProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const reveals = buildParticipantReveals(assignments, people, teams, participantOrder);
  const total = reveals.length;
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const confettiFireRef = useRef<((options: object) => void) | null>(null);
  const [confettiReady, setConfettiReady] = useState(false);

  const [state, dispatch] = useReducer(
    (s: Parameters<typeof revealReducer>[0], e: Parameters<typeof revealReducer>[1]) =>
      revealReducer(s, e, total, reducedMotion),
    { phase: "blurring" as RevealPhase, participantIndex: 0, skipped: false }
  );

  const current = reveals[state.participantIndex];
  const phase = state.phase;
  const isActive = phase !== "idle";

  useEffect(() => {
    dispatch({ type: "START" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      confettiFireRef.current = confetti;
      setConfettiReady(true);
    });
    return () => {
      cancelled = true;
      confettiFireRef.current = null;
    };
  }, []);

  const fireConfetti = useCallback(
    (card: 1 | 2) => {
      const fire = confettiFireRef.current;
      const ref = card === 1 ? card1Ref : card2Ref;
      const el = ref.current;
      if (!fire || !el || !current) return;
      const rect = el.getBoundingClientRect();
      const team = card === 1 ? current.cardB : current.cardA;
      confettiForTeam(
        team,
        {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height / 2) / window.innerHeight,
        },
        reducedMotion,
        fire
      );
    },
    [current, reducedMotion]
  );

  useEffect(() => {
    if (!confettiReady) return;
    if (phase === "card1Celebrate") fireConfetti(1);
    if (phase === "card2Celebrate") fireConfetti(2);
  }, [phase, confettiReady, fireConfetti]);

  useEffect(() => {
    const delay = REVEAL_TIMING_MS[phase];
    if (!delay || phase === "awaitingNext" || phase === "idle") return;
    const timer = window.setTimeout(() => {
      if (phase === "finale") {
        onComplete();
        router.push("/teams");
        onExit?.();
        return;
      }
      dispatch({ type: "TICK" });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [phase, onComplete, onExit, router]);

  const showStage = phase !== "idle" && phase !== "blurring";
  const showHeroName = phase === "nameIn";
  const showHeaderName = [
    "nameDocked",
    "card1Shake",
    "card1Flip",
    "card1Celebrate",
    "card2Shake",
    "card2Flip",
    "card2Celebrate",
    "awaitingNext",
  ].includes(phase);
  const showName = showHeroName || showHeaderName;
  const cardsVisible = showHeaderName;
  const card1Flipped = [
    "card1Flip",
    "card1Celebrate",
    "card2Shake",
    "card2Flip",
    "card2Celebrate",
    "awaitingNext",
  ].includes(phase) || (state.skipped && phase === "awaitingNext");
  const card2Flipped = [
    "card2Flip",
    "card2Celebrate",
    "awaitingNext",
  ].includes(phase) || (state.skipped && phase === "awaitingNext");
  const card1Shake = phase === "card1Shake";
  const card2Shake = phase === "card2Shake";

  if (!current && phase !== "finale") return null;

  return (
    <div
      className={`draw-reveal-root ${isActive ? "is-active" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Draw reveal"
    >
      <motion.div
        className="draw-reveal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "blurring" || showStage ? 1 : 0 }}
        transition={{ duration: 0.8 }}
      />
      <div className="draw-reveal-vignette" aria-hidden />

      <div className="draw-reveal-chrome">
        <p className="mono draw-reveal-progress">
          {phase === "finale"
            ? "FINAL TICKET FILED"
            : `${state.participantIndex + 1} OF ${total}`}
        </p>
        <div className="draw-reveal-controls">
          {phase !== "finale" && phase !== "idle" && (
            <button
              type="button"
              className="draw-reveal-skip"
              onClick={() => dispatch({ type: "SKIP" })}
            >
              Skip
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showStage && (
          <LayoutGroup id={`draw-reveal-${state.participantIndex}`}>
          <motion.div
            key="stage"
            className="draw-reveal-stage"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {phase === "stageIn" && !reducedMotion && (
              <div className="draw-reveal-shuffle" aria-hidden>
                <div className="draw-reveal-hat">
                  <p className="mono draw-reveal-hat-label">Names in the hat</p>
                  <div className="draw-reveal-hat-rim" />
                  <div className="draw-reveal-hat-body">
                    {reveals.slice(0, 8).map((entry, i) => (
                      <span
                        key={entry.participantId}
                        className={`draw-reveal-hat-name draw-reveal-hat-name-${i % 5}`}
                        style={HAT_NAME_SLOTS[i]}
                      >
                        {entry.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {current && showName && (
              <motion.div
                layout
                className={`draw-reveal-name-block ${showHeaderName ? "is-docked" : "is-hero"}`}
                transition={{ layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }}
              >
                <p className="mono draw-reveal-phase">{phaseLabel(phase)}</p>
                <motion.h2
                  key={state.participantIndex}
                  layout="position"
                  className="compressed draw-reveal-name-text"
                  initial={{ x: "-100vw", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{
                    x: { type: "spring", stiffness: 280, damping: 30, mass: 1 },
                    layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                  }}
                >
                  {current.name}
                </motion.h2>
              </motion.div>
            )}

            <div className={`draw-reveal-content ${cardsVisible ? "has-cards" : "is-name-only"}`}>
              {phase === "finale" ? (
                <div className="draw-reveal-finale">
                  <p className="overline">ALLOCATION RECORD · FILED</p>
                  <h2 className="compressed draw-reveal-finale-title">That&apos;s the draw!</h2>
                  <p className="mono text-xs" style={{ color: "var(--dim)" }}>
                    Opening Who&apos;s Got Who…
                  </p>
                </div>
              ) : (
                current && (
                  <>
                    {cardsVisible && (
                    <div className="draw-reveal-cards">
                      <DrawCard
                        cardRef={card1Ref}
                        team={current.cardB}
                        label="B"
                        visible
                        flipped={card1Flipped || (state.skipped && phase === "awaitingNext")}
                        shaking={card1Shake}
                        reducedMotion={reducedMotion}
                      />
                      <DrawCard
                        cardRef={card2Ref}
                        team={current.cardA}
                        label="A"
                        visible
                        flipped={card2Flipped || (state.skipped && phase === "awaitingNext")}
                        shaking={card2Shake}
                        reducedMotion={reducedMotion}
                      />
                    </div>
                    )}

                    {phase === "awaitingNext" && (
                      <motion.div
                        className="draw-reveal-actions"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                      >
                        <button
                          type="button"
                          className="btn text-lg"
                          onClick={() => dispatch({ type: "NEXT" })}
                        >
                          {state.participantIndex + 1 >= total
                            ? "See the full record"
                            : "Reveal next"}
                        </button>
                      </motion.div>
                    )}
                  </>
                )
              )}
            </div>
          </motion.div>
          </LayoutGroup>
        )}
      </AnimatePresence>
    </div>
  );
}
