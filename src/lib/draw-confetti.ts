import type { DrawTeam } from "@/lib/draw-order";

const BAND_COLORS: Record<string, string[]> = {
  A: ["#FFD900", "#F1EAD8", "#141414"],
  B: ["#2038C7", "#3FAE4A", "#F1EAD8"],
};

const CONFETTI_Z = 10005;

type ConfettiFire = (options: object) => void;

export function confettiForTeam(
  team: DrawTeam,
  origin: { x: number; y: number },
  reducedMotion: boolean,
  fire: ConfettiFire
) {
  if (reducedMotion || typeof window === "undefined") return;
  const colors = BAND_COLORS[team.band] ?? BAND_COLORS.A;
  fire({
    particleCount: 120,
    spread: 78,
    startVelocity: 42,
    gravity: 0.9,
    ticks: 220,
    origin,
    colors,
    zIndex: CONFETTI_Z,
    disableForReducedMotion: false,
  });
  window.setTimeout(() => {
    fire({
      particleCount: 70,
      spread: 110,
      startVelocity: 28,
      gravity: 0.85,
      ticks: 200,
      origin,
      colors,
      scalar: 1.1,
      zIndex: CONFETTI_Z,
      disableForReducedMotion: false,
    });
  }, 180);
  window.setTimeout(() => {
    fire({
      particleCount: 50,
      spread: 140,
      startVelocity: 18,
      origin: { x: origin.x, y: Math.max(0.05, origin.y - 0.08) },
      colors,
      zIndex: CONFETTI_Z,
      disableForReducedMotion: false,
    });
  }, 360);
}
