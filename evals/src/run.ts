import { answerQuestion } from "@lumen/rag";
import { closeDb } from "@lumen/db";
import { DATASET, type EvalCase } from "./dataset.js";

interface CaseResult {
  id: string;
  query: string;
  pass: boolean;
  checks: { name: string; pass: boolean; detail: string }[];
  status: string;
  citedSourceKeys: string[];
  retrievedSourceKeys: string[];
  answer: string;
}

function checkStatus(testCase: EvalCase, status: string): { name: string; pass: boolean; detail: string } {
  const expected = testCase.expectStatus ?? "answered";
  return {
    name: "status",
    pass: status === expected,
    detail: `expected "${expected}", got "${status}"`
  };
}

function checkPrimarySourceRetrieved(
  testCase: EvalCase,
  citedSourceKeys: string[],
  retrievedSourceKeys: string[]
): { name: string; pass: boolean; detail: string } | null {
  const primary = testCase.expectSourceKeys?.[0];
  if (!primary) return null;
  const inCitations = citedSourceKeys.includes(primary);
  const inRetrieved = retrievedSourceKeys.includes(primary);
  return {
    name: "primary-source-cited",
    pass: inCitations,
    detail: inCitations
      ? `"${primary}" was cited`
      : inRetrieved
        ? `"${primary}" was retrieved (top-${retrievedSourceKeys.length}) but not cited in the answer`
        : `"${primary}" was not retrieved at all (retrieved: ${retrievedSourceKeys.join(", ") || "none"})`
  };
}

function checkNoInventedCitations(
  testCase: EvalCase,
  citedSourceKeys: string[]
): { name: string; pass: boolean; detail: string } | null {
  if ((testCase.expectStatus ?? "answered") !== "insufficient_context") return null;
  return {
    name: "no-invented-citations",
    pass: citedSourceKeys.length === 0,
    detail:
      citedSourceKeys.length === 0
        ? "no citations returned, as expected"
        : `expected zero citations but got: ${citedSourceKeys.join(", ")}`
  };
}

function checkAnswerContains(
  testCase: EvalCase,
  answer: string
): { name: string; pass: boolean; detail: string } | null {
  if (!testCase.expectAnswerContains || testCase.expectAnswerContains.length === 0) return null;
  const lower = answer.toLowerCase();
  const missing = testCase.expectAnswerContains.filter((needle) => !lower.includes(needle.toLowerCase()));
  return {
    name: "answer-contains",
    pass: missing.length === 0,
    detail: missing.length === 0 ? "all required substrings present" : `missing: ${missing.join(", ")}`
  };
}

async function runCase(testCase: EvalCase): Promise<CaseResult> {
  const result = await answerQuestion(testCase.query, {});
  const citedSourceKeys = [...new Set(result.citations.map((c) => c.sourceKey))];
  const retrievedSourceKeys = [...new Set(result.results.map((r) => r.sourceKey))];

  const checks = [
    checkStatus(testCase, result.status),
    checkPrimarySourceRetrieved(testCase, citedSourceKeys, retrievedSourceKeys),
    checkNoInventedCitations(testCase, citedSourceKeys),
    checkAnswerContains(testCase, result.answer)
  ].filter((c): c is { name: string; pass: boolean; detail: string } => c !== null);

  return {
    id: testCase.id,
    query: testCase.query,
    pass: checks.every((c) => c.pass),
    checks,
    status: result.status,
    citedSourceKeys,
    retrievedSourceKeys,
    answer: result.answer
  };
}

async function main(): Promise<void> {
  const results: CaseResult[] = [];

  for (const testCase of DATASET) {
    process.stdout.write(`Running: ${testCase.id}... `);
    try {
      const result = await runCase(testCase);
      results.push(result);
      console.log(result.pass ? "PASS" : "FAIL");
    } catch (err) {
      results.push({
        id: testCase.id,
        query: testCase.query,
        pass: false,
        checks: [{ name: "no-error", pass: false, detail: err instanceof Error ? err.message : String(err) }],
        status: "ERROR",
        citedSourceKeys: [],
        retrievedSourceKeys: [],
        answer: ""
      });
      console.log("ERROR");
    }
  }

  console.log("\n=== Details ===\n");
  for (const r of results) {
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.id}`);
    console.log(`  query: ${r.query}`);
    console.log(`  status: ${r.status}`);
    console.log(`  retrieved: ${r.retrievedSourceKeys.join(", ") || "(none)"}`);
    console.log(`  cited: ${r.citedSourceKeys.join(", ") || "(none)"}`);
    for (const c of r.checks) {
      console.log(`  - ${c.pass ? "ok" : "FAIL"} ${c.name}: ${c.detail}`);
    }
    console.log("");
  }

  const passCount = results.filter((r) => r.pass).length;
  console.log("=== Summary ===");
  console.log(`${passCount}/${results.length} cases passed`);

  await closeDb();

  if (passCount !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Eval run failed:", err);
  process.exitCode = 1;
});
