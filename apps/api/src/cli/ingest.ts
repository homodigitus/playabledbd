import { closeDb } from "@lumen/db";
import { runIngestion } from "@lumen/rag";

function parseArgs(argv: string[]): { source?: string } {
  const idx = argv.indexOf("--source");
  if (idx === -1) return {};
  return { source: argv[idx + 1] };
}

/** The CLI is the only caller allowed to point ingestion at an arbitrary filesystem path — see
 * runIngestion's docs and the admin HTTP route, which always omits sourcePath. */
async function main(): Promise<void> {
  const { source } = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line no-console
  console.log(`Starting ingestion${source ? ` from ${source}` : " from configured CORPUS_ROOT"}...`);

  const summary = await runIngestion({ sourcePath: source });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
  await closeDb();
  process.exit(summary.status === "FAILED" ? 1 : 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
