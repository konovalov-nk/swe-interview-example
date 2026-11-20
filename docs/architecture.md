# Architecture

## The two panes

`src/App.tsx` is a flex layout:

- `TaskPanel` (left, 27vw) renders `challenge/senior/README.md` with
  `react-markdown`. It also owns the timer, run/reset/tmux/download actions,
  and the last-run summary.
- `FileTree` + `EditorPane` (CodeMirror 6) + `BottomPanel` make the IDE.
- The bottom panel has three tabs: **Terminal** (the VM iframe), **Tests**
  (parsed `unittest` output), **Output** (raw stdout/stderr).

The editor is CodeMirror rather than Monaco: it has Python syntax highlighting,
tabs, search, bracket matching, and VS Code Dark+ styling without a 2–5 MB
editor bundle/worker setup. The `EditorPane` is isolated; replacing it with
Monaco later is a component swap.

## The VM

`public/vm/` is a pinned copy of the LinuxOnTab WASM page (Linux 7.1 compiled
to WebAssembly, xterm, slirp, a lean ext4 rootfs). We do not modify the kernel;
we only expose `window.__term`/`window.__fit` for the parent’s focus/resize
handling.

The page is loaded in a **same-origin iframe**. A cross-origin iframe cannot
get `SharedArrayBuffer`: `crossOriginIsolated` is inherited from the top-level
browsing context. Both the app and the iframe are served with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

`Vite` sets these in dev, `nginx.conf` sets them in production, and
`public/_headers` covers Cloudflare Pages/Netlify. The iframe inherits the
top-level isolation, so the kernel boots. The parent injects a small stylesheet
into the iframe to hide LinuxOnTab’s own top bar and make `#term` fill the
panel.

## Golden image

The VM’s base rootfs is ~3.6 MB (sparse ext4). Installing Python turns ~100 MB
of ext4 blocks dirty. `scripts/build-overlay.mjs`:

1. boots the base VM;
2. `apk add python3 tmux nano` from `vendor/packages` (the page’s package-drop
   path reads `/dev/vdb`, no flaky range downloads);
3. fetches `vm/lot-agent.py` through the page’s local HTTP gateway;
4. starts the agent and runs `lotCommit('swe-base')`;
5. `lotPush` uploads the meta + raw dirty extents to the local build server;
6. gzips the extents to `public/overlays/swe-base.data.gz`.

At runtime `src/lib/vm.ts` fetches the meta + gz, decompresses, and puts the
record into IndexedDB `lot-images` **before** creating the iframe. The VM boots
with `?image=@swe-base` and applies the overlay. The record is cached per
browser, so subsequent loads only fetch the small base assets.

The overlay is bound to the `sha256` in
`public/vm/linux-dist/rootfs-lean.manifest.json`. Do not replace the base
assets without rebuilding the overlay.

## Guest agent

`vm/lot-agent.py` listens on `0.0.0.0:45999` and speaks one JSON object per
line. The page’s `window.guestAgentCall(port, payload)` opens a synthetic TCP
connection to the guest through the in-page slirp; no external network is
involved.

Operations:

- `ping`
- `read` / `write` (base64, atomic temp+rename)
- `list` / `stat`
- `exec` (subprocess, timeout, stdout/stderr/exit code)
- `spawn` (detached process)
- `symlink`

The agent is started with `/usr/local/bin/python3 -S` so the challenge’s broken
`sitecustomize.py` cannot take the editor bridge down. The **candidate’s**
commands still go through the broken CI runner and hit the planted bugs.

## Provisioning

`src/lib/provision.ts` writes the workspace and the five breakages after the
agent answers:

1. `run_tests.sh` → `/opt/venv/bin` wrapper with a bad `PYTHONHOME`;
2. the runner’s target → `legacy_tests` (3 smoke tests);
3. `tests/solution.py` → a stale all-True copy that shadows `../solution.py`;
4. `sitecustomize.py` → non-blocking `socket.connect`;
5. `/opt/rogue.py` → listener on `127.0.0.1:18080`.

The reset button reboots the iframe, re-seeds the overlay from IndexedDB, and
re-runs provisioning with the candidate’s current `solution.py` preserved.

## Security and limits

- No backend, no database, no session server. The app is static.
- The VM is a browser sandbox; treat it as untrusted code.
- The agent is reachable only through the page’s in-process slirp, not from the
  network.
- First load is the only heavy step (VM assets + overlay). Chrome desktop is
  the supported target; mobile keyboards are not.
