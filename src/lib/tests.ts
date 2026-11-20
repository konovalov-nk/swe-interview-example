export type TestStatus = "pass" | "fail" | "error" | "skip";

export type ParsedTest = {
  name: string;
  full: string;
  status: TestStatus;
  detail?: string;
};

export type TestRun = {
  tests: ParsedTest[];
  ran: number | null;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  ok: boolean | null;
  raw: string;
  exit: number | null;
  durationMs: number;
  at: number;
};

const RESULT_RE = /^(\S+)\s+\(([^)]+)\)(?:\s+\.\.\.)?\s+(ok|FAIL|ERROR|skipped.*)$/gm;
const RAN_RE = /^Ran\s+(\d+)\s+tests?/m;
const FAILED_RE = /^FAILED\s*\(([^)]*)\)/m;

export function parseUnittest(
  output: string,
  meta: { exit: number | null; durationMs: number },
): TestRun {
  const tests: ParsedTest[] = [];
  for (const match of output.matchAll(RESULT_RE)) {
    const [, name, full, result] = match;
    let status: TestStatus = "pass";
    if (result === "FAIL") status = "fail";
    else if (result === "ERROR") status = "error";
    else if (result.startsWith("skipped")) status = "skip";
    tests.push({
      name,
      full,
      status,
      detail: result.startsWith("skipped") ? result.slice(7).trim() : undefined,
    });
  }

  const ranMatch = output.match(RAN_RE);
  const failedMatch = output.match(FAILED_RE);
  const passed = tests.filter((t) => t.status === "pass").length;
  const skipped = tests.filter((t) => t.status === "skip").length;
  const failed = tests.filter((t) => t.status === "fail").length;
  const errors = tests.filter((t) => t.status === "error").length;

  let ok: boolean | null = null;
  if (/^\s*OK\b/m.test(output)) ok = failed === 0 && errors === 0;
  else if (failedMatch) ok = false;

  return {
    tests,
    ran: ranMatch ? Number(ranMatch[1]) : null,
    passed,
    failed,
    errors,
    skipped,
    ok,
    raw: output,
    exit: meta.exit,
    durationMs: meta.durationMs,
    at: Date.now(),
  };
}

export function shortName(full: string): string {
  const parts = full.split(".");
  return parts[parts.length - 1] || full;
}
