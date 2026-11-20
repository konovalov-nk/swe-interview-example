import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { TaskPanel } from "./components/TaskPanel";
import { FileTree } from "./components/FileTree";
import { EditorPane } from "./components/EditorPane";
import { BottomPanel, type BottomTab } from "./components/BottomPanel";
import { SessionsDialog } from "./components/SessionsDialog";
import { VmFrame } from "./components/VmFrame";
import { FILES, TASK_MARKDOWN, TREE } from "./lib/challenge";
import { TMUX_COMMAND, provisionEnvironment } from "./lib/provision";
import { agentSource, runnerSource } from "./lib/agentSources";
import { parseUnittest, type TestRun } from "./lib/tests";
import type { GuestAgent } from "./lib/vm";
import { SessionRecorder } from "./lib/telemetry/recorder";
import { deleteAllSessions, deleteSession, downloadSession, listSessions, saveSession } from "./lib/telemetry/store";
import type { SessionBundle } from "./lib/telemetry/types";
import "./App.css";

const INITIAL_FILES = Object.fromEntries(FILES.map((f) => [f.path, f.content]));
const TASK = { id: "healthcheck", version: "senior@1", title: "Healthcheck service" };

export default function App() {
  const [files, setFiles] = useState<Record<string, string>>(INITIAL_FILES);
  const filesRef = useRef(files);
  const [openTabs, setOpenTabs] = useState<string[]>(["solution.py"]);
  const [activePath, setActivePath] = useState("solution.py");
  const activePathRef = useRef(activePath);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const dirtyRef = useRef(dirty);
  const [agent, setAgent] = useState<GuestAgent | null>(null);
  const agentRef = useRef<GuestAgent | null>(null);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [pagePhase, setPagePhase] = useState("loading");
  const [phaseDetail, setPhaseDetail] = useState("");
  const [testRun, setTestRun] = useState<TestRun | null>(null);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [bottomHeight, setBottomHeight] = useState(300);
  const [taskOpen, setTaskOpen] = useState(true);
  const [sessionKey, setSessionKey] = useState(0);
  const [remaining, setRemaining] = useState(60 * 60);
  const [started, setStarted] = useState(false);
  const [attemptEnded, setAttemptEnded] = useState(false);
  const [recordOptIn, setRecordOptIn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [savedSession, setSavedSession] = useState<SessionBundle | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionBundle[]>([]);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const endedRef = useRef(false);
  const provisioningRef = useRef(false);
  const readySessionRef = useRef<number | null>(null);
  const pendingSolutionRef = useRef<string | null>(null);
  const resizingRef = useRef(false);

  filesRef.current = files;
  activePathRef.current = activePath;
  dirtyRef.current = dirty;
  agentRef.current = agent;

  const isClean = useMemo(
    () =>
      Object.keys(INITIAL_FILES).every((path) => (files[path] ?? "") === INITIAL_FILES[path]) &&
      Object.keys(files).length === Object.keys(INITIAL_FILES).length,
    [files],
  );

  useEffect(() => {
    if (!started || pagePhase !== "ready") return;
    const id = window.setInterval(
      () => setRemaining((value) => Math.max(0, value - 1)),
      1_000,
    );
    return () => window.clearInterval(id);
  }, [started, pagePhase]);

  const onPhase = useCallback((phase: string, detail = "") => {
    setPagePhase(phase);
    setPhaseDetail(detail);
  }, []);

  const onFrame = useCallback((next: HTMLIFrameElement | null) => {
    setFrame(next);
  }, []);

  const handleAgent = useCallback(async (nextAgent: GuestAgent) => {
    if (provisioningRef.current) return;
    if (readySessionRef.current === sessionKey) return;

    provisioningRef.current = true;
    setAgent(nextAgent);
    agentRef.current = nextAgent;
    onPhase("provisioning", "Starting the command runner…");

    const keep = pendingSolutionRef.current ?? filesRef.current["solution.py"] ?? "";
    try {
      await nextAgent.restartAgentAndRunner(agentSource, runnerSource);
      onPhase("provisioning", "Writing the workspace…");
      await provisionEnvironment(nextAgent, { keepSolution: keep });
      nextAgent.clearTerminal();
      const clean: Record<string, string> = { ...INITIAL_FILES, "solution.py": keep };
      filesRef.current = clean;
      setFiles(clean);
      setDirty(new Set());
      dirtyRef.current = new Set();
      pendingSolutionRef.current = null;
      readySessionRef.current = sessionKey;
      onPhase("ready");
      recorderRef.current?.event("vm.ready", {});
    } catch (err) {
      onPhase("error", err instanceof Error ? err.message : String(err));
    } finally {
      provisioningRef.current = false;
    }
  }, [onPhase, sessionKey]);

  const saveFile = useCallback(async (path: string) => {
    const currentAgent = agentRef.current;
    if (!currentAgent) return;
    const content = filesRef.current[path];
    if (content == null) return;
    try {
      await currentAgent.writeText(`/root/work/${path}`, content);
      recorderRef.current?.event("editor.save", { path, length: content.length });
      setDirty((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        dirtyRef.current = next;
        return next;
      });
    } catch (err) {
      console.error("save failed", err);
    }
  }, []);

  const handleChange = useCallback((path: string, value: string) => {
    const next = { ...filesRef.current, [path]: value };
    filesRef.current = next;
    setFiles(next);
    setDirty((prev) => {
      if (prev.has(path)) return prev;
      const withPath = new Set(prev);
      withPath.add(path);
      dirtyRef.current = withPath;
      return withPath;
    });
  }, []);

  // Debounced autosave for the visible file. Ctrl-S and tab switches save
  // immediately as well.
  useEffect(() => {
    if (!agent || !dirty.has(activePath)) return;
    const id = window.setTimeout(() => void saveFile(activePath), 900);
    return () => window.clearTimeout(id);
  }, [files, activePath, dirty, agent, saveFile]);

  const openFile = useCallback(
    (path: string) => {
      if (dirtyRef.current.has(activePathRef.current)) {
        void saveFile(activePathRef.current);
      }
      recorderRef.current?.event("file.open", { path });
      setActivePath(path);
      activePathRef.current = path;
      setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path]));
      if (bottomTab !== "terminal") setBottomTab("terminal");
    },
    [bottomTab, saveFile],
  );

  const closeTab = useCallback(
    (path: string) => {
      setOpenTabs((tabs) => {
        const next = tabs.filter((p) => p !== path);
        if (path === activePathRef.current) {
          const fallback = next[next.length - 1] ?? "";
          setActivePath(fallback);
          activePathRef.current = fallback;
        }
        return next;
      });
    },
    [],
  );

  const runTests = useCallback(async () => {
    const currentAgent = agentRef.current;
    if (!currentAgent || runningRef.current) return;
    if (dirtyRef.current.has(activePathRef.current)) {
      await saveFile(activePathRef.current);
    }
    runningRef.current = true;
    setRunning(true);
    setBottomTab("tests");
    setOutput("");
    const recorder = recorderRef.current;
    recorder?.beginRun("cd /root/work && ./run_tests.sh", filesRef.current);
    try {
      const result = await currentAgent.exec("cd /root/work && ./run_tests.sh", {
        cwd: "/root/work",
        timeoutMs: 120_000,
      });
      const raw = [result.stdout, result.stderr].filter(Boolean).join("\n");
      const parsed = parseUnittest(raw, {
        exit: result.exit,
        durationMs: result.duration_ms,
      });
      setOutput(`${raw}\n\n[exit ${result.exit ?? "?"} · ${result.duration_ms} ms]`);
      setTestRun(parsed);
      recorder?.endRun({
        stdout: result.stdout,
        stderr: result.stderr,
        exit: result.exit,
        durationMs: result.duration_ms,
        ok: parsed.ok,
        counts: {
          ran: parsed.ran,
          passed: parsed.passed,
          failed: parsed.failed,
          errors: parsed.errors,
          skipped: parsed.skipped,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOutput(message);
      setTestRun(null);
      recorder?.endRun({
        stderr: message,
        exit: null,
        durationMs: 0,
        ok: false,
        counts: { ran: null, passed: 0, failed: 0, errors: 1, skipped: 0 },
      });
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [saveFile]);

  const finishAttempt = useCallback(
    async (reason: "manual" | "timeout" | "reset") => {
      if (!started || endedRef.current) return;
      endedRef.current = true;
      setStarted(false);
      setAttemptEnded(true);
      setRecording(false);
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (!recorder) return;
      const bundle = recorder.finish(filesRef.current, reason);
      setSavedSession(bundle);
      await saveSession(bundle);
    },
    [started],
  );

  useEffect(() => {
    if (started && !attemptEnded && remaining <= 0) void finishAttempt("timeout");
  }, [started, attemptEnded, remaining, finishAttempt]);

  const startAttempt = useCallback(() => {
    if (started || pagePhase !== "ready" || !agentRef.current) return;
    if (recordOptIn && isClean) {
      const recorder = new SessionRecorder(TASK);
      recorder.start();
      recorder.event("vm.ready", {});
      recorderRef.current = recorder;
      setRecording(true);
    }
    endedRef.current = false;
    setAttemptEnded(false);
    setSavedSession(null);
    setStarted(true);
  }, [started, pagePhase, recordOptIn, isClean]);

  const openSessions = useCallback(async () => {
    setSessions(await listSessions());
    setSessionsOpen(true);
  }, []);

  const removeSession = useCallback(async (id: string) => {
    await deleteSession(id);
    setSessions(await listSessions());
  }, []);

  const removeAllSessions = useCallback(async () => {
    await deleteAllSessions();
    setSessions([]);
    setSavedSession(null);
  }, []);

  const resetEnvironment = useCallback(() => {
    if (!agentRef.current) return;
    recorderRef.current?.event("vm.reset", {});
    pendingSolutionRef.current = filesRef.current["solution.py"] ?? "";
    readySessionRef.current = null;
    setAgent(null);
    agentRef.current = null;
    setFrame(null);
    setTestRun(null);
    setOutput("");
    setPhaseDetail("");
    setPagePhase("resetting");
    setSessionKey((key) => key + 1);
    setBottomTab("terminal");
  }, []);

  const openTmux = useCallback(() => {
    const win = frame?.contentWindow as any;
    if (!win) return;
    try {
      win.guestSend(TMUX_COMMAND);
      setBottomTab("terminal");
      window.setTimeout(() => win.__term?.focus?.(), 250);
    } catch (err) {
      console.error(err);
    }
  }, [frame]);

  const downloadSubmission = useCallback(() => {
    const payload = {
      challenge: "healthcheck",
      level: "senior",
      exported_at: new Date().toISOString(),
      solution: filesRef.current["solution.py"] ?? "",
      test_file: filesRef.current["tests/test_solution.py"] ?? "",
      runner: filesRef.current["run_tests.sh"] ?? "",
      last_run: testRun,
      output,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "healthcheck-submission.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [output, testRun]);

  const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizingRef.current = true;
    const startY = event.clientY;
    const startHeight = bottomHeight;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";

    const onMove = (e: MouseEvent) => {
      const max = window.innerHeight - 230;
      const next = Math.max(130, Math.min(max, startHeight + (startY - e.clientY)));
      setBottomHeight(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const vm = (
    <VmFrame
      sessionKey={sessionKey}
      onAgent={handleAgent}
      onFrame={onFrame}
      onPhase={onPhase}
    />
  );
  const canRun = agent != null && pagePhase === "ready" && started && !attemptEnded;

  return (
    <div className="app">
      <TopBar
        agentReady={agent != null && pagePhase === "ready"}
        canRun={canRun}
        phase={pagePhase}
        running={running}
        taskOpen={taskOpen}
        onToggleTask={() => setTaskOpen((v) => !v)}
        onRun={runTests}
        onReset={resetEnvironment}
        onTmux={openTmux}
        onSessions={openSessions}
      />

      {pagePhase === "error" ? (
        <div className="error-banner">
          <strong>Environment error:</strong> {phaseDetail}
          <button className="btn small" onClick={resetEnvironment}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="body">
        {taskOpen ? (
          <TaskPanel
            markdown={TASK_MARKDOWN}
            testRun={testRun}
            running={running}
            agentReady={agent != null && pagePhase === "ready"}
            canRun={canRun}
            phase={pagePhase}
            remaining={remaining}
            onRun={runTests}
            onReset={resetEnvironment}
            onTmux={openTmux}
            onDownload={downloadSubmission}
            session={{
              started,
              ended: attemptEnded,
              optIn: recordOptIn,
              clean: isClean,
              recording,
              saved: savedSession != null,
              onOptIn: setRecordOptIn,
              onStart: startAttempt,
              onEnd: () => void finishAttempt("manual"),
              onDownload: () => savedSession && void downloadSession(savedSession),
            }}
          />
        ) : null}

        <main className="ide">
          <div className="ide-main">
            <FileTree tree={TREE} activePath={activePath} dirty={dirty} onOpen={openFile} />
            <EditorPane
              openTabs={openTabs}
              activePath={activePath}
              files={files}
              dirty={dirty}
              onChange={handleChange}
              onSelect={openFile}
              onClose={closeTab}
              onSave={saveFile}
            />
          </div>
          <div className="resizer" onMouseDown={startResize} />
          <div className="bottom-wrap" style={{ height: bottomHeight }}>
            <BottomPanel
              tab={bottomTab}
              onTab={setBottomTab}
              testRun={testRun}
              running={running}
              output={output}
              frame={frame}
              vm={vm}
            />
          </div>
        </main>
      </div>

      <SessionsDialog
        open={sessionsOpen}
        sessions={sessions}
        onClose={() => setSessionsOpen(false)}
        onDownload={(session) => void downloadSession(session)}
        onDelete={(id) => void removeSession(id)}
        onDeleteAll={() => void removeAllSessions()}
      />

      <footer className="statusbar">
        <span className="status-remote">LinuxOnTab WASM</span>
        <span>Python 3.11.14</span>
        <span>UTF-8</span>
        <span>LF</span>
        <span>Spaces: 4</span>
        <span className="status-right">
          {pagePhase === "ready" ? "● connected" : pagePhase} · 512 MiB · 1 vCPU
        </span>
      </footer>
    </div>
  );
}
