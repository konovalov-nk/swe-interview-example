import { FILES, WORKSPACE } from "./challenge";
import type { GuestAgent } from "./vm";

const VENV_WRAPPER = `#!/bin/sh
# Shared CI venv. The interpreter lives in the base image.
export PYTHONHOME=/opt/python3.10
exec /usr/local/bin/python3 "$@"
`;

const PYVENV_CFG = `home = /opt/python3.10
include-system-site-packages = false
version = 3.11.14
`;

const SITECUSTOMIZE = `"""Compatibility hooks installed by the old profiling job."""
import socket

_orig_connect = socket.socket.connect


def _connect(self, address):
    self.setblocking(False)
    return _orig_connect(self, address)


socket.socket.connect = _connect
`;

const ROGUE = `import socket

s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", 18080))
s.listen(16)
while True:
    conn, _ = s.accept()
    conn.close()
`;

const TMUX_CONF = `set -g mouse on
set -g base-index 1
setw -g pane-base-index 1
set -g status-left '[#S] '
setw -g window-status-current-format ' #I:#W '
`;

const NANO_RC = `syntax "python" "\\\\.py$"
color green "\\\\b(def|class|import|from|return|if|else|elif|for|while|try|except|finally|with|as|in|not|and|or|is|None|True|False|raise|yield|lambda|pass|break|continue)\\\\b"
color cyan "\\\\b[0-9]+\\\\b"
color yellow "\\".*\\"|'.*'"
color magenta "^[[:space:]]*#.*"
`;

async function baseSitePackages(agent: GuestAgent): Promise<string> {
  try {
    const r = await agent.exec(
      '/usr/local/bin/python3 -c "import site; print(site.getsitepackages()[0])"',
      { timeoutMs: 10_000 },
    );
    const line = r.stdout
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("/"))
      .pop();
    if (line) return line;
  } catch {
    /* fall through */
  }
  return "/usr/local/lib/python3.11/site-packages";
}

export async function provisionEnvironment(
  agent: GuestAgent,
  opts: { keepSolution?: string } = {},
): Promise<void> {
  await agent.exec(
    "mkdir -p /root/work/tests /root/work/legacy_tests /opt/venv/bin /opt/venv/lib/python3.11/site-packages",
    { timeoutMs: 10_000 },
  );

  for (const file of FILES) {
    await agent.writeText(`${WORKSPACE}/${file.path}`, file.content);
  }
  // tests/solution.py is a stale test-local copy (from FILES). It shadows the
  // real ../solution.py when the suite is started from tests/, which is exactly
  // what the old runner does.

  // Broken interpreter + compatibility hook, both live outside the workspace.
  await agent.writeText("/opt/venv/bin/python3", VENV_WRAPPER);
  await agent.writeText("/opt/venv/pyvenv.cfg", PYVENV_CFG);
  const sitePackages = await baseSitePackages(agent);
  await agent.writeText(`${sitePackages}/sitecustomize.py`, SITECUSTOMIZE);

  await agent.exec(
    "chmod +x /root/work/run_tests.sh /opt/venv/bin/python3; rm -rf /root/work/__pycache__ /root/work/tests/__pycache__",
    { timeoutMs: 10_000 },
  );

  await agent.writeText("/opt/rogue.py", ROGUE);
  await agent.writeText("/root/.tmux.conf", TMUX_CONF);
  await agent.writeText("/root/.nanorc", NANO_RC);
  // Background it through the runner shell: the wasm Python cannot fork, and
  // this kernel has no setsid. The pid file lets the agent stop it without
  // relying on pkill.
  await agent.killPidFile("/tmp/rogue.pid").catch(() => {});
  await agent.exec(
    "/usr/local/bin/python3 /opt/rogue.py >/dev/null 2>&1 & echo $! > /tmp/rogue.pid",
    { timeoutMs: 5_000 },
  );

  if (opts.keepSolution != null) {
    await agent.writeText(`${WORKSPACE}/solution.py`, opts.keepSolution);
  }
}

export const TMUX_COMMAND = [
  "tmux kill-session -t work 2>/dev/null || true;",
  "tmux new-session -d -s work -c /root/work;",
  "tmux new-window -t work -c /root/work 'nano -Y python solution.py';",
  "tmux new-window -t work -c /root/work 'python3 -i';",
  "tmux select-window -t work:1;",
  "tmux attach -t work",
].join(" ");
