import type { EffectivenessIndex } from "../types.js";

export function computeEffectivenessIndex(
  sentimentResult: { overallCompound: number },
  toneResult: { confidenceNet: number },
): EffectivenessIndex {
  const sentScore = ((sentimentResult.overallCompound + 1) / 2) * 50;
  const confScore = ((toneResult.confidenceNet + 1) / 2) * 50;
  const score = Math.min(100, Math.max(0, Math.round(sentScore + confScore)));
  let label: EffectivenessIndex["label"];
  if (score >= 70) label = "effective";
  else if (score >= 40) label = "balanced";
  else label = "struggling";
  return { score, label };
}
