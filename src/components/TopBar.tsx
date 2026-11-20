import {
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  SquareTerminal,
} from "lucide-react";

type Props = {
  agentReady: boolean;
  canRun: boolean;
  phase: string;
  running: boolean;
  taskOpen: boolean;
  onToggleTask: () => void;
  onRun: () => void;
  onReset: () => void;
  onTmux: () => void;
  onSessions: () => void;
};

export function TopBar({
  agentReady,
  canRun,
  phase,
  running,
  taskOpen,
  onToggleTask,
  onRun,
  onReset,
  onTmux,
  onSessions,
}: Props) {
  const statusLabel =
    phase === "ready"
      ? "VM ready"
      : phase === "error"
        ? "VM error"
        : phase === "provisioning"
          ? "Preparing workspace"
          : "VM booting";
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">_$</span>
        <span className="brand-name">platform</span>
        <span className="brand-sep">/</span>
        <span className="brand-file">services/healthcheck</span>
      </div>

      <div className="topbar-spacer" />

      <span
        className={`vm-status ${agentReady ? "on" : ""} ${phase === "error" ? "err" : ""}`}
      >
        <span className="status-dot" />
        {statusLabel}
      </span>

      <button className="icon-btn" onClick={onToggleTask} title="Toggle task panel">
        {taskOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
      </button>
      <button className="icon-btn" onClick={onSessions} title="Saved sessions">
        <History size={15} />
      </button>
      <button className="icon-btn" onClick={onTmux} disabled={!agentReady} title="Open tmux workspace">
        <SquareTerminal size={15} />
      </button>
      <button className="icon-btn" onClick={onReset} disabled={!agentReady} title="Reset environment">
        <RotateCcw size={15} />
      </button>
      <button className="btn primary small" onClick={onRun} disabled={!canRun || running}>
        <Play size={13} /> {running ? "Running" : "Run"}
      </button>
    </header>
  );
}
