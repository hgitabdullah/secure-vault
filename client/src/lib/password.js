/** Simple, transparent password scoring (0-4) shown as the 4-segment meter from the design. */
export function scorePassword(p) {
  const checks = {
    length: p.length >= 12, number: /\d/.test(p), symbol: /[^A-Za-z0-9]/.test(p), upper: /[A-Z]/.test(p) && /[a-z]/.test(p),
  };
  let score = Object.values(checks).filter(Boolean).length;
  if (p.length < 8) score = Math.min(score, 1);
  if (p.length >= 16) score = Math.min(4, score + 1);
  return { score, checks };
}
