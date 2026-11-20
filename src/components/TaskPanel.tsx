import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Play,
  RotateCcw,
  SquareTerminal,
  XCircle,
} from "lucide-react";
import type { TestRun } from "../lib/tests";

type Props = {
  markdown: string;
  testRun: TestRun | null;
  running: boolean;
  agentReady: boolean;
  phase: string;
  remaining: number;
  onRun: () => void;
  onReset: () => void;
  onTmux: () => void;
  onDownload: () => void;
};

function fmt(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TaskPanel({
  markdown,
  testRun,
  running,
  agentReady,
  phase,
  remaining,
  onRun,
  onReset,
  onTmux,
  onDownload,
}: Props) {
  const summary = testRun
    ? testRun.ran == null
      ? "suite did not start"
      : `${testRun.ran} tests · ${testRun.passed} passed`
    : "not run yet";

  return (
    <aside className="task-panel">
      <div className="task-head">
        <div>
          <div className="eyebrow">TASK · HC-142</div>
          <h1>Healthcheck service</h1>
        </div>
      </div>

      <div className="task-meta">
        <span className={remaining < 300 ? "timer danger" : "timer"}>
          <Clock3 size={13} /> {fmt(remaining)}
        </span>
        <span className="dot-sep" />
        <span className={phase === "error" ? "danger-text" : agentReady ? "muted" : "warn"}>
          {phase === "error" ? "environment error" : agentReady ? "environment ready" : "booting"}
        </span>
      </div>

      <div className="task-actions">
        <button className="btn primary" onClick={onRun} disabled={!agentReady || running}>
          <Play size={14} /> {running ? "Running…" : "Run tests"}
        </button>
        <button className="btn" onClick={onTmux} disabled={!agentReady} title="Open tmux: shell, nano, python">
          <SquareTerminal size={14} /> Tmux
        </button>
        <button className="btn ghost" onClick={onReset} disabled={!agentReady} title="Reboot the VM and restore the broken environment">
          <RotateCcw size={14} />
        </button>
        <button className="btn ghost" onClick={onDownload} title="Download your solution and last test output">
          <Download size={14} />
        </button>
      </div>

      <div className="task-scroll">
        <div className={`run-card ${testRun?.ok === false ? "bad" : testRun?.ok ? "good" : ""}`}>
          <div className="run-card-title">
            {testRun?.ok === true ? (
              <CheckCircle2 size={15} />
            ) : testRun?.ok === false ? (
              <XCircle size={15} />
            ) : (
              <AlertTriangle size={15} />
            )}
            {summary}
          </div>
          <div className="run-card-sub">
            {testRun
              ? `exit ${testRun.exit ?? "?"} · ${testRun.durationMs} ms`
              : "Run ./run_tests.sh from the workspace, or use the button above."}
          </div>
        </div>

        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
            code: ({ className, children, ...props }) => {
              const isBlock = /language-/.test(className || "");
              return isBlock ? (
                <code className={className} {...props}>
                  {children}
                </code>
              ) : (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </aside>
  );
}
