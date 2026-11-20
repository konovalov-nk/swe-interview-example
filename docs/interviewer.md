# Interviewer notes — healthcheck / senior

**Do not give this file to the candidate.** The candidate sees the task panel;
the five problems below are the answer key.

## Setup

- Open the site, share the screen, let the candidate drive.
- 60 minutes. The timer starts when the VM is ready.
- The workspace is `/root/work`; the editor and terminal are two views of the
  same filesystem.
- The candidate may use the internet and LLM assistants. That is deliberate:
  the bugs are in runtime state, not in a hidden algorithm.

The environment is reset with the top-bar reset button. It restores the broken
state and keeps only the current `solution.py`.

## The five problems

### 1. The CI interpreter is broken

`run_tests.sh` puts `/opt/venv/bin` first and calls `python3`. That file is a
wrapper:

```sh
#!/bin/sh
export PYTHONHOME=/opt/python3.10
exec /usr/local/bin/python3 "$@"
```

`/opt/python3.10` does not exist. Python dies before `unittest` starts:

```
Fatal Python error: init_fs_encoding: failed to get the Python codec of the
filesystem encoding
ModuleNotFoundError: No module named 'encodings'
```

**Fix:** remove the `PYTHONHOME` line (or the wrapper), or stop putting
`/opt/venv/bin` on `PATH`, or invoke `/usr/local/bin/python3` explicitly.

**Why it is interesting:** the traceback mentions the Python runtime, not the
wrapper. `command -v python3` / `cat /opt/venv/bin/python3` is the fast path.

### 2. The runner runs the wrong tests

After fixing the interpreter, `./run_tests.sh` prints:

```
Ran 3 tests in 0.001s
OK
```

Those are the three `legacy_tests/test_smoke.py` checks. The real acceptance
suite is `tests/test_solution.py` and has 20 tests. The task statement says 20.

**Fix:** point the runner at `tests/`, e.g.

```sh
cd tests
python3 -m unittest -v test_solution
```

**Why it is interesting:** a green result is not the same as the right result.
The candidate has to compare the task with what actually ran.

### 3. The test-local `solution.py` is a stale copy

```
/root/work/tests/solution.py     # old all-True helper
/root/work/solution.py           # the file the candidate edits
```

When the suite runs from `tests/`, `import solution` resolves to the local
copy. Edits to `/root/work/solution.py` have no effect.
`python3 -c "import solution; print(solution.__file__)"` from `tests/` exposes
it (the test file inserts the parent into `sys.path`, so the real module is
still reachable once the stale copy is gone).

**Fix:** delete `tests/solution.py`, or run the suite from `/root/work`
(`python3 -m unittest tests.test_solution`), or remove the test directory from
the import path.

**Why it is interesting:** it looks like “my implementation is wrong” while the
implementation is not being imported at all. The duplicate file is easy to
ignore, and editing it makes the suite green without touching the real code.

### 4. A `sitecustomize` hook breaks every TCP connect

`/usr/local/lib/python3.11/site-packages/sitecustomize.py` runs at interpreter
startup and wraps `socket.socket.connect`:

```python
def _connect(self, address):
    self.setblocking(False)
    return _orig_connect(self, address)
```

Every connect now raises `BlockingIOError: [Errno 115] Operation now in
progress`, so every host looks down. The traceback points at the candidate's
`check_hosts`, not at `sitecustomize`.

**Fix:** delete/rename the hook or remove the monkeypatch. `python3 -S` skips
`site` and therefore the hook, but also any real site-packages; that is a valid
debugging shortcut, not a complete repair.

**Why it is interesting:** it is global state installed before `unittest`
imports the tests. `python3 -v` or `python3 -c "import socket; print(socket.socket.connect)"`
shows where the function came from.

### 5. Something is listening on the “down” port

`test_single_unreachable` expects `127.0.0.1:18080` to be closed. A leftover
process (`/opt/rogue.py`) accepts and immediately closes connections there, so
the probe reports the host as up.

**Fix:** find and kill it:

```sh
ps | grep rogue
netstat -ltn | grep 18080
kill <pid>
```

**Why it is interesting:** the failure is a false positive, not an exception.
The candidate has to inspect process/port state. Changing the port in the test
is not a fix; the grader uses the pristine test and 18080.

## Expected solution

```python
import socket
from concurrent.futures import ThreadPoolExecutor


def check_hosts(hosts, port=80, timeout=0.5):
    unique = list(dict.fromkeys(hosts))
    if not unique:
        return {}

    def probe(host):
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return host, True
        except (OSError, ValueError, OverflowError):
            return host, False

    with ThreadPoolExecutor(max_workers=min(32, len(unique))) as pool:
        return dict(pool.map(probe, unique))
```

The test suite checks IPv4/IPv6, empty input, duplicate collapse, order,
invalid addresses/ports, per-host timeout, concurrency, socket cleanup,
global-timeout hygiene, and thread safety.

Note: the wasm32 guest kernel has no IPv6 loopback (`::1`), so the three IPv6
tests self-skip there (`IPv6 loopback unavailable`). Run the final hidden
grader on a normal Linux host to exercise them.

## Grading

Suggested weights:

| Area | Weight | What good looks like |
| --- | ---: | --- |
| Environment | 40% | Finds all five, explains each root cause, does not mask symptoms |
| Solution | 30% | Contract is correct; 20/20 in a clean run; hidden edge cases pass |
| Process | 20% | Reproduces, forms hypotheses, reads errors, isolates variables |
| Communication | 10% | Narrates findings; asks good questions; leaves a clean state |

Red flags:

- edits/deletes assertions to make a broken implementation pass;
- “fixes” the wrong-target bug by deleting the acceptance tests;
- kills the terminal/VM and restarts instead of investigating;
- pastes the test file into an LLM and follows a generic answer without
  verifying the runtime state;
- changes the down-port in the test instead of finding the listener.

## Final grading

The visible tests are editable, so do not score from the candidate’s copy.
For an automated final check:

1. Start a clean VM (reset).
2. Copy only the candidate’s `solution.py` into `/root/work`.
3. Copy pristine `tests/` and run with the system interpreter
   (`PATH=/usr/local/bin:/usr/bin:/bin`, `python3 -m unittest -v test_solution`).
4. Add hidden edge cases (large batches, hostnames, port boundaries) if the
   role warrants it.

The five environment fixes are assessed from the session and the diff, not
from the final clean run.
