#!/usr/bin/env python3
"""Tiny host<->guest agent for the interview IDE.

The page opens a synthetic TCP connection to this port through LinuxOnTab's
slirp (window.guestAgentCall).  One JSON object per line, one JSON reply per
line.  Runs with -S so a broken sitecustomize.py cannot take it down.

Important: this Python is compiled for wasm32 and has no os.fork/subprocess.
Commands are therefore handed to /bin/sh via a FIFO serviced by
vm/lot-runner.sh; the agent itself only does file I/O and waits for the
runner's result files.
"""
import base64
import json
import os
import socket
import sys
import threading
import time

PORT = 45999
WORKSPACE = "/root/work"

RUN_CMD = "/tmp/lot-cmd"
RUN_OUT = "/tmp/lot-out"
RUN_EXIT = "/tmp/lot-exit"
RUN_DONE = "/tmp/lot-done"


def reply(conn, obj):
    try:
        conn.sendall((json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8"))
    except OSError:
        pass


def do_read(req):
    with open(req["path"], "rb") as f:
        data = f.read()
    return {"ok": True, "data": base64.b64encode(data).decode("ascii"), "size": len(data)}


def do_write(req):
    data = base64.b64decode(req.get("data") or "")
    path = req["path"]
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    tmp = path + ".lot-tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    return {"ok": True, "size": len(data)}


def do_list(req):
    path = req.get("path") or WORKSPACE
    entries = []
    for name in sorted(os.listdir(path)):
        full = os.path.join(path, name)
        try:
            st = os.stat(full)
        except OSError:
            continue
        entries.append({
            "name": name,
            "dir": os.path.isdir(full),
            "size": st.st_size,
            "mtime": int(st.st_mtime),
        })
    return {"ok": True, "entries": entries}


def do_stat(req):
    st = os.stat(req["path"])
    return {"ok": True, "stat": {"size": st.st_size, "mtime": int(st.st_mtime), "mode": st.st_mode}}


def _unlink(path):
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def do_exec(req):
    cmd = req["cmd"].replace("\n", " ")
    timeout = float(req.get("timeout") or 60)
    started = time.time()

    for path in (RUN_DONE, RUN_EXIT, RUN_OUT):
        _unlink(path)

    try:
        # O_NONBLOCK makes an absent runner fail with ENXIO instead of blocking.
        fd = os.open(RUN_CMD, os.O_WRONLY | os.O_NONBLOCK)
    except OSError as exc:
        return {
            "ok": False,
            "error": "command runner is not ready: %s" % exc,
            "exit": None,
            "stdout": "",
            "stderr": "",
            "duration_ms": 0,
        }

    try:
        os.write(fd, (cmd + "\n").encode("utf-8"))
    finally:
        os.close(fd)

    deadline = started + timeout
    while time.time() < deadline:
        if os.path.exists(RUN_DONE):
            break
        time.sleep(0.05)

    if not os.path.exists(RUN_DONE):
        return {
            "ok": False,
            "error": "timeout",
            "exit": None,
            "stdout": "",
            "stderr": "",
            "duration_ms": int((time.time() - started) * 1000),
        }

    try:
        with open(RUN_OUT, "rb") as f:
            out = f.read().decode("utf-8", "replace")
        with open(RUN_EXIT, "r") as f:
            exit_code = int(f.read().strip() or -1)
    except (OSError, ValueError) as exc:
        return {"ok": False, "error": "bad runner result: %s" % exc, "exit": None,
                "stdout": "", "stderr": "", "duration_ms": int((time.time() - started) * 1000)}

    for path in (RUN_DONE, RUN_EXIT, RUN_OUT):
        _unlink(path)

    return {
        "ok": True,
        "exit": exit_code,
        "stdout": out,
        "stderr": "",
        "duration_ms": int((time.time() - started) * 1000),
    }


def do_spawn(req):
    # The runner shell handles the actual backgrounding.
    result = do_exec({"cmd": "nohup %s >/dev/null 2>&1 &" % req["cmd"],
                      "timeout": req.get("timeout") or 10})
    if not result.get("ok"):
        return result
    return {"ok": True, "pid": 0}


def do_symlink(req):
    path = req["path"]
    target = req["target"]
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
    os.symlink(target, path)
    return {"ok": True}


def do_chmod(req):
    os.chmod(req["path"], int(req["mode"], 8))
    return {"ok": True}


def do_kill(req):
    with open(req["path"], "r") as f:
        pid = int(f.read().strip())
    os.kill(pid, 15)
    return {"ok": True, "pid": pid}


def dispatch(req):
    op = req.get("op")
    if op == "ping":
        return {"ok": True, "pid": os.getpid(), "version": 2}
    if op == "read":
        return do_read(req)
    if op == "write":
        return do_write(req)
    if op == "list":
        return do_list(req)
    if op == "stat":
        return do_stat(req)
    if op == "exec":
        return do_exec(req)
    if op == "spawn":
        return do_spawn(req)
    if op == "symlink":
        return do_symlink(req)
    if op == "chmod":
        return do_chmod(req)
    if op == "kill":
        return do_kill(req)
    return {"ok": False, "error": "unknown op: %r" % (op,)}


def serve(conn):
    try:
        stream = conn.makefile("rb")
        for line in stream:
            if not line.strip():
                continue
            try:
                req = json.loads(line)
            except Exception as exc:  # noqa: BLE001
                reply(conn, {"ok": False, "error": "bad json: %s" % exc})
                continue
            try:
                reply(conn, dispatch(req))
            except Exception as exc:  # noqa: BLE001
                reply(conn, {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)})
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except OSError:
            pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", PORT))
    srv.listen(16)
    sys.stderr.write("lot-agent listening on %d\n" % PORT)
    sys.stderr.flush()
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=serve, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    main()
