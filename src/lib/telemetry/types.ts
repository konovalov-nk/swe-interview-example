export const SESSION_SCHEMA = "swe-interview/session@1" as const;
export const SESSION_LIMIT = 5;

export type SessionEventType =
  | "session.start"
  | "session.end"
  | "vm.ready"
  | "vm.reset"
  | "file.open"
  | "editor.save"
  | "run.start"
  | "run.end";

export type SessionEvent = {
  seq: number;
  t: number;
  at: string;
  type: SessionEventType;
  payload: Record<string, unknown>;
};

export type SessionCounts = {
  ran: number | null;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
};

export type SessionRun = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  command: string;
  exit: number | null;
  ok: boolean | null;
  counts: SessionCounts;
  output: string;
};

export type SessionTask = {
  id: string;
  version: string;
  title: string;
};

export type SessionBundle = {
  schema: typeof SESSION_SCHEMA;
  id: string;
  startedAt: string;
  endedAt: string;
  task: SessionTask;
  events: SessionEvent[];
  runs: SessionRun[];
  files: Record<string, string>;
};

export type SessionStart = {
  task: SessionTask;
};

export type RunStart = {
  command: string;
  files: Record<string, string>;
};

export type RunResult = {
  stdout?: string;
  stderr?: string;
  exit: number | null;
  durationMs: number;
  ok: boolean | null;
  counts: SessionCounts;
  tests?: { name: string; status: string }[];
};
