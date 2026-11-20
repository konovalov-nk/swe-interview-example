import {
  SESSION_SCHEMA,
  type RunResult,
  type SessionBundle,
  type SessionEvent,
  type SessionEventType,
  type SessionRun,
  type SessionTask,
} from "./types";

const MAX_EVENTS = 2000;
const MAX_OUTPUT = 12000;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class SessionRecorder {
  private readonly task: SessionTask;
  private readonly id = newId();
  private readonly events: SessionEvent[] = [];
  private readonly runs: SessionRun[] = [];
  private readonly startedAt = new Date().toISOString();
  private readonly startedPerf = performance.now();
  private seq = 0;
  private runSeq = 0;
  private currentRun: { id: string; command: string; startedAt: string } | null = null;
  private bundle: SessionBundle | null = null;

  constructor(task: SessionTask) {
    this.task = task;
  }

  get active(): boolean {
    return this.bundle == null;
  }

  get sessionId(): string {
    return this.id;
  }

  start(): void {
    this.event("session.start", { task: this.task });
  }

  event(type: SessionEventType, payload: Record<string, unknown>): void {
    if (this.bundle || this.events.length >= MAX_EVENTS) return;
    this.events.push({
      seq: this.seq++,
      t: Math.round(performance.now() - this.startedPerf),
      at: new Date().toISOString(),
      type,
      payload,
    });
  }

  beginRun(command: string, files: Record<string, string>): string {
    const id = `r${++this.runSeq}`;
    this.currentRun = {
      id,
      command,
      startedAt: new Date().toISOString(),
    };
    this.event("run.start", {
      runId: id,
      command,
      files: Object.keys(files),
    });
    return id;
  }

  endRun(result: RunResult): SessionRun | null {
    const run = this.currentRun;
    if (!run) return null;
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(0, MAX_OUTPUT);
    const record: SessionRun = {
      id: run.id,
      startedAt: run.startedAt,
      endedAt: new Date().toISOString(),
      durationMs: result.durationMs,
      command: run.command,
      exit: result.exit,
      ok: result.ok,
      counts: result.counts,
      output,
    };
    this.runs.push(record);
    this.event("run.end", {
      runId: run.id,
      durationMs: result.durationMs,
      exit: result.exit,
      ok: result.ok,
      counts: result.counts,
    });
    this.currentRun = null;
    return record;
  }

  finish(files: Record<string, string>, reason: "manual" | "timeout" | "reset"): SessionBundle {
    if (this.bundle) return this.bundle;
    this.event("session.end", { reason });
    this.bundle = {
      schema: SESSION_SCHEMA,
      id: this.id,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      task: this.task,
      events: [...this.events],
      runs: [...this.runs],
      files: { ...files },
    };
    return this.bundle;
  }
}
