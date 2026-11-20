import { BarChart3, Download, History, Trash2, X } from "lucide-react";
import { formatDuration } from "../lib/telemetry/analyze";
import type { SessionBundle } from "../lib/telemetry/types";

type Props = {
  open: boolean;
  sessions: SessionBundle[];
  onClose: () => void;
  onDownload: (session: SessionBundle) => void;
  onAnalytics: (session: SessionBundle) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
};

function durationOf(session: SessionBundle): number {
  return new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
}

function resultOf(session: SessionBundle): string {
  const last = session.runs[session.runs.length - 1];
  if (!last) return "no runs";
  if (last.ok === true) return "passed";
  if (last.ok === false) return "failed";
  return "no result";
}

export function SessionsDialog({
  open,
  sessions,
  onClose,
  onDownload,
  onAnalytics,
  onDelete,
  onDeleteAll,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal sessions-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div className="modal-title">
            <History size={16} /> Sessions
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </header>

        <div className="modal-body">
          {sessions.length === 0 ? (
            <div className="empty-panel">
              <p>No saved sessions.</p>
              <p>Start an attempt with recording enabled.</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div className="session-row" key={session.id}>
                <div className="session-info">
                  <strong>{new Date(session.startedAt).toLocaleString()}</strong>
                  <span>
                    {formatDuration(durationOf(session))} · {session.runs.length} runs ·{" "}
                    {resultOf(session)}
                  </span>
                </div>
                <div className="session-actions">
                  <button className="btn small" onClick={() => onDownload(session)}>
                    <Download size={12} /> Download
                  </button>
                  <button className="btn small" onClick={() => onAnalytics(session)}>
                    <BarChart3 size={12} /> Analytics
                  </button>
                  <button className="btn small ghost" onClick={() => onDelete(session.id)}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="modal-foot">
          <span>{sessions.length}/5 saved in this browser</span>
          <button className="btn small ghost" onClick={onDeleteAll} disabled={sessions.length === 0}>
            <Trash2 size={12} /> Delete all
          </button>
        </footer>
      </section>
    </div>
  );
}
