"use client";

import { motion } from "framer-motion";
import type { DrawTeam } from "@/lib/draw-order";

interface DrawCardProps {
  team: DrawTeam;
  label: string;
  flipped: boolean;
  shaking: boolean;
  visible: boolean;
  reducedMotion: boolean;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}

export function DrawCard({
  team,
  label,
  flipped,
  shaking,
  visible,
  reducedMotion,
  cardRef,
}: DrawCardProps) {
  return (
    <motion.div
      ref={cardRef}
      className={`draw-card-wrap ${shaking && !reducedMotion ? "draw-card-shake" : ""}`}
      initial={{ opacity: 0, y: 40, x: label === "A" ? -24 : 24 }}
      animate={
        visible
          ? { opacity: 1, y: 0, x: 0 }
          : { opacity: 0, y: 40, x: label === "A" ? -24 : 24 }
      }
      transition={{
        type: "spring",
        stiffness: 210,
        damping: 28,
        delay: label === "B" ? 0.2 : 0,
      }}
    >
      <div className={`draw-card-scene ${flipped ? "is-flipped" : ""}`}>
        <div className="draw-card draw-card-back">
          <span className="draw-card-mark compressed">MATCHKIT</span>
          <span className="mono draw-card-band">{label === "A" ? "BAND A" : "BAND B"}</span>
          <span className="draw-card-sheen" aria-hidden />
        </div>
        <div className="draw-card draw-card-front">
          <span className="draw-card-flag" aria-hidden>
            {team.flag}
          </span>
          <span className="compressed draw-card-team">{team.name}</span>
          <span className="mono draw-card-meta">
            {label === "A" ? "CONTENDER" : "WILDCARD"} · [{team.world_rank}]
          </span>
        </div>
      </div>
    </motion.div>
  );
}
