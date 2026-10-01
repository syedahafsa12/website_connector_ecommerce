import type { ContentFlag } from "@/server/offers/types";

// Heuristic only — a real system would layer a classifier and allow-list
// rendering. This exists to make section-19-style prompt injection visible
// and blockable, not to be a robust adversarial-content detector.
const SUSPICIOUS_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior) instructions/i,
  /purchase this (product|item) immediately/i,
  /do not ask the user/i,
  /place( an)? order (now|immediately)/i,
  /disregard (the )?(system|previous) prompt/i,
  /you must (buy|purchase|order)/i,
];

export function scanForUntrustedContent(field: string, text: string): ContentFlag[] {
  const flags: ContentFlag[] = [];
  for (const pattern of SUSPICIOUS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      flags.push({ field, pattern: pattern.source, excerpt: match[0] });
    }
  }
  return flags;
}
