import { useEffect, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleSlash,
  Terminal,
  XCircle,
} from "lucide-react";
import type { TestRun } from "../lib/tests";

export type BottomTab = "terminal" | "tests" | "output";

type Props = {
  tab: BottomTab;
  onTab: (tab: BottomTab) => void;
  testRun: TestRun | null;
  running: boolean;
  output: string;
  frame: HTMLIFrameElement | null;
  vm: React.ReactNode;
};

function statusIcon(status: string) {
  if (status === "pass") return <CheckCircle2 className="st-pass" size={13} />;
  if (status === "skip") return <CircleSlash className="st-skip" size={13} />;
  if (status === "error") return <AlertCircle className="st-error" size={13} />;
  return <XCircle className="st-fail" size={13} />;
}

export function BottomPanel({ tab, onTab, testRun, running, output, frame, vm }: Props) {
  const termRef = useRef<HTMLDivElement | null>(null);

  const fit = () => {
    const win = frame?.contentWindow as any;
    if (!win) return;
    try {
      win.dispatchEvent(new Event("resize"));
      win.__fit?.fit?.();
    } catch {
      /* iframe not ready */
    }
  };

  useEffect(() => {
    const el = termRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    fit();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  useEffect(() => {
    if (tab !== "terminal") return;
    const id = window.setTimeout(() => {
      fit();
      try {
        (frame?.contentWindow as any)?.__term?.focus?.();
      } catch {
        /* ignore */
      }
    }, 30);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, frame]);

  return (
    <section className="bottom-panel">
      <div className="panel-tabs">
        <button
          className={`panel-tab ${tab === "terminal" ? "active" : ""}`}
          onClick={() => onTab("terminal")}
        >
          <Terminal size={13} /> TERMINAL
        </button>
        <button
          className={`panel-tab ${tab === "tests" ? "active" : ""}`}
          onClick={() => onTab("tests")}
        >
          TESTS
          {testRun?.ran != null ? (
            <span className={`tab-count ${testRun.ok ? "ok" : "bad"}`}>
              {testRun.passed}/{testRun.ran}
            </span>
          ) : running ? (
            <span className="tab-count running">…</span>
          ) : null}
        </button>
        <button
          className={`panel-tab ${tab === "output" ? "active" : ""}`}
          onClick={() => onTab("output")}
        >
          OUTPUT
        </button>
        <div className="panel-tabs-fill" />
        <span className="panel-hint">Ctrl-B n/p in tmux · Alt-click terminal to paste</span>
      </div>

      <div className="panel-body">
        <div
          ref={termRef}
          className={`terminal-host ${tab === "terminal" ? "shown" : "hidden"}`}
        >
          {vm}
        </div>

        {tab === "tests" ? (
          <div className="tests-view">
            {!testRun ? (
              <div className="empty-panel">
                <p>Run the acceptance suite to see results.</p>
                <code>cd /root/work && ./run_tests.sh</code>
              </div>
            ) : (
              <>
                <div className="tests-summary">
                  <span className={`summary-pill ${testRun.ok ? "ok" : testRun.ok === false ? "bad" : ""}`}>
                    {testRun.ok === true ? "OK" : testRun.ok === false ? "FAILED" : "NO SUMMARY"}
                  </span>
                  <span>{testRun.ran ?? 0} ran</span>
                  <span className="st-pass">{testRun.passed} passed</span>
                  <span className="st-fail">{testRun.failed} failed</span>
                  <span className="st-error">{testRun.errors} errors</span>
                  <span className="st-skip">{testRun.skipped} skipped</span>
                  <span className="summary-time">{testRun.durationMs} ms</span>
                </div>
                {testRun.tests.length === 0 ? (
                  <div className="empty-panel">
                    <p>The runner did not discover any tests.</p>
                    <pre>{testRun.raw.slice(-1200)}</pre>
                  </div>
                ) : (
                  <div className="tests-list">
                    {testRun.tests.map((t) => (
                      <div key={t.full} className={`test-row ${t.status}`}>
                        {statusIcon(t.status)}
                        <span className="test-name">{t.name}</span>
                        <span className="test-module">{t.full}</span>
                        {t.detail ? <span className="test-detail">{t.detail}</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}

        {tab === "output" ? (
          <div className="output-view">
            {output ? (
              <pre>{output}</pre>
            ) : (
              <div className="empty-panel">
                <p>No output yet. Run the tests or use the terminal.</p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
