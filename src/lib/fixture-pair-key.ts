/** Canonical key for a fixture pair — order-independent. */
export function fixturePairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}
