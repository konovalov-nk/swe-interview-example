import type { SessionBundle, SessionRun } from "./types";

export type SessionStats = {
  durationMs: number;
  timeToFirstSaveMs: number | null;
  timeToFirstRunMs: number | null;
  timeToGreenMs: number | null;
  runs: number;
  failedRuns: number;
  fileMs: Record<string, number>;
  runDurations: { id: string; ms: number; ok: boolean | null }[];
};

function firstEvent(bundle: SessionBundle, type: string): number | null {
  return bundle.events.find((event) => event.type === type)?.t ?? null;
}

export function analyzeSession(bundle: SessionBundle): SessionStats {
  const durationMs = Math.max(
    0,
    new Date(bundle.endedAt).getTime() - new Date(bundle.startedAt).getTime(),
  );
  const fileMs: Record<string, number> = {};
  const opens = bundle.events.filter((event) => event.type === "file.open");
  for (let i = 0; i < opens.length; i += 1) {
    const path = String((opens[i].payload as { path?: unknown }).path ?? "");
    if (!path) continue;
    const next = opens[i + 1]?.t ?? durationMs;
    fileMs[path] = (fileMs[path] ?? 0) + Math.max(0, Math.min(next, durationMs) - opens[i].t);
  }
  const green = bundle.events.find(
    (event) => event.type === "run.end" && (event.payload as { ok?: unknown }).ok === true,
  );
  return {
    durationMs,
    timeToFirstSaveMs: firstEvent(bundle, "editor.save"),
    timeToFirstRunMs: firstEvent(bundle, "run.start"),
    timeToGreenMs: green?.t ?? null,
    runs: bundle.runs.length,
    failedRuns: bundle.runs.filter((run) => run.ok === false).length,
    fileMs,
    runDurations: bundle.runs.map((run: SessionRun) => ({
      id: run.id,
      ms: run.durationMs,
      ok: run.ok,
    })),
  };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
