/* Bridge to the LinuxOnTab VM.
 *
 * The VM is a same-origin iframe.  The page exposes window.guestAgentCall(),
 * which opens a synthetic TCP connection to a port inside the guest through
 * the in-page slirp.  A tiny Python agent (vm/lot-agent.py) speaks one JSON
 * object per line on that socket.
 */

export const AGENT_PORT = 45999;

export type ExecResult = {
  ok: boolean;
  exit: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  error?: string;
};

export type DirEntry = {
  name: string;
  dir: boolean;
  size: number;
  mtime: number;
};

type GuestCall = (port: number, payload: unknown, timeoutMs?: number) => Promise<any>;

function guestCall(frame: HTMLIFrameElement): GuestCall {
  const fn = (frame.contentWindow as any)?.guestAgentCall as GuestCall | undefined;
  if (!fn) throw new Error("VM is still booting");
  return fn;
}

export class GuestAgent {
  private readonly frame: HTMLIFrameElement;
  private lastPid = 0;

  constructor(frame: HTMLIFrameElement) {
    this.frame = frame;
  }

  private async call<T = any>(payload: unknown, timeoutMs = 20_000): Promise<T> {
    const fn = guestCall(this.frame);
    const result = await fn(AGENT_PORT, payload, timeoutMs);
    if (result == null) throw new Error("empty reply from guest agent");
    return result as T;
  }

  async ping(): Promise<boolean> {
    try {
      const r = await this.call<{ ok: boolean; pid: number }>({ op: "ping" }, 2_000);
      if (r.ok && r.pid) this.lastPid = r.pid;
      return !!r.ok;
    } catch {
      return false;
    }
  }

  async readBase64(path: string): Promise<string> {
    const r = await this.call<{ ok: boolean; data: string; error?: string }>(
      { op: "read", path },
      20_000,
    );
    if (!r.ok) throw new Error(r.error || `read failed: ${path}`);
    return r.data;
  }

  async readText(path: string): Promise<string> {
    const b64 = await this.readBase64(path);
    return new TextDecoder().decode(base64ToBytes(b64));
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeBytes(path, new TextEncoder().encode(text));
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    const r = await this.call<{ ok: boolean; error?: string }>(
      { op: "write", path, data: bytesToBase64(bytes) },
      30_000,
    );
    if (!r.ok) throw new Error(r.error || `write failed: ${path}`);
  }

  async list(path: string): Promise<DirEntry[]> {
    const r = await this.call<{ ok: boolean; entries: DirEntry[]; error?: string }>(
      { op: "list", path },
      15_000,
    );
    if (!r.ok) throw new Error(r.error || `list failed: ${path}`);
    return r.entries;
  }

  async exec(cmd: string, opts: { cwd?: string; timeoutMs?: number } = {}): Promise<ExecResult> {
    const timeout = opts.timeoutMs ?? 120_000;
    const r = await this.call<ExecResult>(
      { op: "exec", cmd, cwd: opts.cwd, timeout: timeout / 1000 },
      timeout + 5_000,
    );
    return r;
  }

  clearTerminal(): void {
    try {
      const win = this.frame.contentWindow as any;
      win.__term?.clear?.();
      win.guestSend?.("");
    } catch {
      /* cosmetic */
    }
  }

  async killPidFile(path: string): Promise<void> {
    const r = await this.call<{ ok: boolean; error?: string }>({ op: "kill", path }, 5_000);
    if (!r.ok) throw new Error(r.error || `kill failed: ${path}`);
  }

  async spawn(cmd: string, cwd = "/root/work"): Promise<number> {
    const r = await this.call<{ ok: boolean; pid: number; error?: string }>(
      { op: "spawn", cmd, cwd },
      10_000,
    );
    if (!r.ok) throw new Error(r.error || "spawn failed");
    return r.pid;
  }

  /**
   * The golden overlay ships the first-generation agent (subprocess-based),
   * but this Python is wasm32 and has no os.fork. Replace it in place with the
   * FIFO agent and start the shell runner. Done once per boot.
   */
  async restartAgentAndRunner(agentSource: string, runnerSource: string): Promise<void> {
    await this.writeText("/opt/lot-agent.py", agentSource);
    await this.writeText("/opt/lot-runner.sh", runnerSource);

    const win = this.frame.contentWindow as any;
    if (!win?.guestSend) throw new Error("guest shell is not available");
    const kill = this.lastPid > 1 ? `kill ${this.lastPid} 2>/dev/null; ` : "";
    win.guestSend(
      `${kill}/usr/local/bin/python3 -S /opt/lot-agent.py >/var/log/lot-agent.log 2>&1 & ` +
        `/bin/sh /opt/lot-runner.sh >/dev/null 2>&1 &`,
    );

    const started = Date.now();
    while (Date.now() - started < 30_000) {
      await wait(700);
      if (!(await this.ping())) continue;
      const r = await this.exec("echo __RUNNER_OK__", { timeoutMs: 5_000 });
      if (r.ok && (r.stdout || "").includes("__RUNNER_OK__")) return;
    }
    throw new Error("guest agent/command runner did not restart");
  }

  async symlink(path: string, target: string): Promise<void> {
    // Prefer the agent op (os.symlink, no shell quirks). Busybox ln does not
    // understand GNU's -n, which is why the shell fallback uses plain -sf.
    try {
      const viaAgent = await this.call<{ ok: boolean; error?: string }>(
        { op: "symlink", path, target },
        5_000,
      );
      if (viaAgent.ok) return;
    } catch {
      /* fall through to shell */
    }
    const q = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
    const r = await this.exec(`ln -sf ${q(target)} ${q(path)}`, { timeoutMs: 5_000 });
    if (r.exit !== 0) throw new Error(r.stderr || `symlink failed: ${path}`);
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the in-guest agent answers. The iframe runs its own boot; this
 *  polls the synthetic TCP channel instead of guessing from terminal text. */
export async function waitForAgent(
  frame: HTMLIFrameElement,
  timeoutMs = 90_000,
  onTick?: (elapsedMs: number) => void,
): Promise<GuestAgent> {
  const started = Date.now();
  const agent = new GuestAgent(frame);
  while (Date.now() - started < timeoutMs) {
    if (await agent.ping()) return agent;
    onTick?.(Date.now() - started);
    await wait(900);
  }
  throw new Error("guest agent did not start (see /var/log/lot-agent.log in the terminal)");
}

/* ------------------------------------------------------------------ */
/* Overlay seeding                                                     */
/* ------------------------------------------------------------------ */

export const OVERLAY_NAME = "swe-base";
export const OVERLAY_META_URL = "/overlays/swe-base.json";

export function buildVmUrl(): string {
  const cmd =
    "/usr/local/bin/python3 -S /opt/lot-agent.py >/var/log/lot-agent.log 2>&1 &";
  const params = new URLSearchParams({
    autoboot: "1",
    image: `@${OVERLAY_NAME}`,
    cmd,
  });
  return `/vm/?${params.toString()}`;
}
