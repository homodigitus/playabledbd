export type RankedCandidate<T> = { id: string; payload: T };
export type FusedResult<T> = { id: string; payload: T; score: number };

/**
 * Reciprocal Rank Fusion: combines several independently-ranked candidate lists (e.g. vector
 * similarity order and full-text rank order) into one ranking without needing the lists' raw
 * scores to be on comparable scales — only their rank position matters. `k` dampens the
 * contribution of low ranks; 60 is the commonly cited default from the original RRF paper.
 * The first list to introduce a given id "wins" that id's payload (used here to keep vector
 * metadata such as raw cosine similarity when a chunk appears in both lists).
 */
export function reciprocalRankFusion<T>(lists: RankedCandidate<T>[][], k = 60): FusedResult<T>[] {
  const scores = new Map<string, { payload: T; score: number }>();

  for (const list of lists) {
    list.forEach((candidate, idx) => {
      const rank = idx + 1;
      const contribution = 1 / (k + rank);
      const existing = scores.get(candidate.id);
      if (existing) {
        existing.score += contribution;
      } else {
        scores.set(candidate.id, { payload: candidate.payload, score: contribution });
      }
    });
  }

  return Array.from(scores.entries())
    .map(([id, v]) => ({ id, payload: v.payload, score: v.score }))
    .sort((a, b) => b.score - a.score);
}
