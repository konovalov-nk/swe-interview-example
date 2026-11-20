import { BarChart3, X } from "lucide-react";
import { analyzeSession, formatDuration } from "../lib/telemetry/analyze";
import type { SessionBundle } from "../lib/telemetry/types";

type Props = {
  session: SessionBundle | null;
  onClose: () => void;
};

function value(ms: number | null): string {
  return ms == null ? "—" : formatDuration(ms);
}

export function SessionAnalytics({ session, onClose }: Props) {
  if (!session) return null;
  const stats = analyzeSession(session);
  const files = Object.entries(stats.fileMs);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal analytics-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div className="modal-title">
            <BarChart3 size={16} /> Session analytics
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </header>

        <div className="modal-body">
          <div className="stats-grid">
            <div><span>Duration</span><strong>{formatDuration(stats.durationMs)}</strong></div>
            <div><span>First save</span><strong>{value(stats.timeToFirstSaveMs)}</strong></div>
            <div><span>First run</span><strong>{value(stats.timeToFirstRunMs)}</strong></div>
            <div><span>First green</span><strong>{value(stats.timeToGreenMs)}</strong></div>
            <div><span>Runs</span><strong>{stats.runs}</strong></div>
            <div><span>Failed runs</span><strong>{stats.failedRuns}</strong></div>
          </div>

          <h3>Files</h3>
          {files.length === 0 ? (
            <p className="muted">No file events.</p>
          ) : (
            <div className="stats-list">
              {files.map(([path, ms]) => (
                <div key={path}>
                  <span>{path}</span>
                  <strong>{formatDuration(ms)}</strong>
                </div>
              ))}
            </div>
          )}

          <h3>Runs</h3>
          {stats.runDurations.length === 0 ? (
            <p className="muted">No runs.</p>
          ) : (
            <div className="stats-list">
              {stats.runDurations.map((run) => (
                <div key={run.id}>
                  <span>{run.id} · {run.ok === true ? "passed" : run.ok === false ? "failed" : "no result"}</span>
                  <strong>{formatDuration(run.ms)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
