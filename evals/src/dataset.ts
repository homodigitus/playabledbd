export interface EvalCase {
  id: string;
  query: string;
  /** Expected answering status. Defaults to "answered" when omitted. */
  expectStatus?: "answered" | "insufficient_context";
  /**
   * sourceKey values (as stored on `documents.source_key`, e.g. "network-specs-applovin.md")
   * that a correct answer should cite. Only checked when expectStatus is "answered".
   * The first entry is the primary/required document; any further entries are documents
   * that add useful context but are not required for a pass.
   */
  expectSourceKeys?: string[];
  /**
   * Case-insensitive substrings that must all appear somewhere in the answer text.
   * Used to check the model surfaces specific facts (e.g. a deprecation notice)
   * rather than just citing the right document.
   */
  expectAnswerContains?: string[];
  notes?: string;
}

/**
 * From sample_questions.md (the case study's own eval spec) plus one out-of-corpus
 * question it explicitly asks for. Extend this array with the private set in the same
 * shape — the runner in run.ts does not hardcode anything about these specific cases.
 */
export const DATASET: EvalCase[] = [
  {
    id: "applovin-file-size",
    query: "What is the maximum file size for an AppLovin playable, and how does it ship?",
    expectSourceKeys: ["network-specs-applovin.md"],
    notes: "sample_questions.md #1"
  },
  {
    id: "sdk-init-deprecation",
    query: "How do I initialize the current Lumen SDK, and what happened to lumen.track?",
    expectSourceKeys: ["sdk-notes-v3.md", "sdk-notes-v2.md"],
    expectAnswerContains: ["deprecat"],
    notes: "sample_questions.md #2 — sdk-notes-v2.md is deprecated; a good answer says so"
  },
  {
    id: "sound-assets-separate-pass",
    query: "Why are sound assets built in a separate pass?",
    expectSourceKeys: ["build-pipeline.md"],
    notes: "sample_questions.md #3 — incident-postmortem-2026-03.md adds useful context"
  },
  {
    id: "applovin-march-incident",
    query: "What caused the March 2026 AppLovin rejections and what was fixed?",
    expectSourceKeys: ["incident-postmortem-2026-03.md"],
    notes: "sample_questions.md #4"
  },
  {
    id: "localization-fallback",
    query: "Which languages must every playable ship with, and what is the fallback?",
    expectSourceKeys: ["localization-guide.md"],
    notes: "sample_questions.md #5"
  },
  {
    id: "out-of-corpus-vacation-policy",
    query: "How many vacation days do employees get, and what is the salary band for a mid-level engineer?",
    expectStatus: "insufficient_context",
    notes:
      "sample_questions.md's explicit out-of-corpus case — correct behavior is an honest " +
      "'the corpus does not cover this' with no invented citation."
  }
];
