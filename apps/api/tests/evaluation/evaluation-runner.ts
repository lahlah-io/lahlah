import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classify, CLASSIFIER_SYSTEM_PROMPT } from "../../src/modules/chat/services/classifier.js";

type IntentCase = {
  id: string;
  input: string;
  expectedIntent: string;
  mode: "rule" | "model" | "todo";
  note?: string;
  priority?: string;
};

type ResultEntry = {
  id: string;
  input: string;
  expected: string;
  actual: string;
  source: string;
  confidence?: number;
  pass: boolean;
  mode: string;
  priority: string;
};

const FIXTURE = new URL("../fixtures/chatbot/intent-cases.json", import.meta.url);
const REPORTS = new URL("./reports/", import.meta.url);
const LATEST = new URL("./reports/latest.json", import.meta.url);

function proceedingsDir() {
  // fileURLToPath needs node:url; keep it lazy so lint/tests never hit our report folder.
  return fileURLToPath(REPORTS);
}

function summaryText(prefix: string, passed: number, total: number, accuracy: number) {
  return `${prefix}: ${passed}/${total} = ${accuracy.toFixed(1)}%`;
}

async function main() {
  const model = (process.env.AI_CLASSIFIER_MODEL || process.env.AI_TOOL_MODEL || "").trim();
  const provider = (process.env.AI_CLASSIFIER_PROVIDER || process.env.AI_PROVIDER || "").trim();
  const base = (process.env.AI_BASE_URL || process.env.AI_CLASSIFIER_BASE_URL || "").trim();
  const key = (process.env.AI_API_KEY || process.env.AI_CLASSIFIER_API_KEY || "").trim();
  if (!model || !base || !key) {
    console.error("eval:llm — AI belum dikonfigurasi. Butuh AI_CLASSIFIER_MODEL/AI_TOOL_MODEL, AI_BASE_URL, AI_API_KEY di .env.");
    process.exit(2);
  }

  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    datasetVersion: string;
    promptVersion: string;
    referenceDate: string;
    timezone: string;
    cases: IntentCase[];
  };
  const promptHash = createHash("sha256").update(CLASSIFIER_SYSTEM_PROMPT).digest("hex").slice(0, 12);
  const runId = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const results: ResultEntry[] = [];
  for (const c of fixture.cases) {
    if (c.mode === "todo") continue;
    const r = await classify(c.input, process.env);
    results.push({
      id: c.id,
      input: c.input,
      expected: c.expectedIntent,
      actual: r.intent,
      source: r.source,
      confidence: r.confidence,
      pass: r.intent === c.expectedIntent,
      mode: c.mode,
      priority: c.priority ?? "medium",
    });
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const accuracy = total === 0 ? 0 : (passed / total) * 100;

  // Regression vs. latest: case yang lulus sebelumnya tapi gagal sekarang.
  const regressions: string[] = [];
  if (existsSync(LATEST)) {
    const prev = JSON.parse(readFileSync(LATEST, "utf8")) as { results?: Array<{ id: string; pass: boolean }> };
    const prevMap = new Map((prev.results ?? []).map((r) => [r.id, r.pass]));
    for (const r of results) {
      if (prevMap.get(r.id) === true && !r.pass) regressions.push(r.id);
    }
  }

  const report = {
    runId,
    timestamp: new Date().toISOString(),
    datasetVersion: fixture.datasetVersion,
    promptVersion: fixture.promptVersion,
    promptHash,
    model,
    provider,
    baseUrl: base,
    referenceDate: fixture.referenceDate,
    timezone: fixture.timezone,
    total,
    passed,
    failed: total - passed,
    accuracy,
    regressions,
    results,
  };

  mkdirSync(proceedingsDir(), { recursive: true });
  writeFileSync(new URL(`./reports/${runId}.json`, import.meta.url), JSON.stringify(report, null, 2));
  writeFileSync(LATEST, JSON.stringify(report, null, 2));

  const fails = results.filter((r) => !r.pass);
  console.log(`\nChatbot LLM intent evaluation — ${runId}`);
  console.log(`model=${model} (${provider})  prompt=${fixture.promptVersion}#${promptHash}`);
  console.log(summaryText("overall", passed, total, accuracy));
  const byPriority = new Map<string, { p: number; t: number }>();
  for (const r of results) {
    const g = byPriority.get(r.priority) ?? { p: 0, t: 0 };
    g.t += 1;
    if (r.pass) g.p += 1;
    byPriority.set(r.priority, g);
  }
  for (const [prio, g] of byPriority) console.log(summaryText(`  [${prio}]`, g.p, g.t, (g.p / g.t) * 100));

  if (fails.length) {
    console.log("\nGagal:");
    for (const f of fails) console.log(`  ${f.id}  "${f.input}"  expected=${f.expected} actual=${f.actual} (${f.source})`);
  } else {
    console.log("\nSemua kasus lolos.");
  }

  if (regressions.length) console.log(`\nRegression (dulu lolos, sekarang gagal): ${regressions.join(", ")}`);
  console.log(`\nLaporan: tests/evaluation/reports/${runId}.json\n`);

  if (regressions.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});