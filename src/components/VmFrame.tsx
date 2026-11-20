import { useEffect, useRef, useState } from "react";
import { Loader2, TerminalSquare } from "lucide-react";
import {
  OVERLAY_META_URL,
  buildVmUrl,
  waitForAgent,
  type GuestAgent,
} from "../lib/vm";

type Props = {
  sessionKey: number;
  onAgent: (agent: GuestAgent) => void;
  onFrame: (frame: HTMLIFrameElement | null) => void;
  onPhase: (phase: string, detail?: string) => void;
};

const EMBED_CSS = `
  #wrap { height: 100vh !important; display: block !important; background: #0b0d10 !important; }
  #wrap > *:not(#term) { display: none !important; }
  body { overflow: hidden !important; background: #0b0d10 !important; }
  #term {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    padding: 8px 8px 4px 8px !important;
    box-sizing: border-box !important;
    background: #0b0d10 !important;
  }
  #term .xterm { height: 100% !important; }
  #term .xterm-viewport { background: #0b0d10 !important; }
  #term-pip, #storage-panel, #ssh-panel, #x-view, #cgi-view, #wv, #modal {
    display: none !important;
  }
`;

function injectCss(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc) return;
  let style = doc.getElementById("swe-embed-style") as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = "swe-embed-style";
    doc.head.appendChild(style);
  }
  style.textContent = EMBED_CSS;
}

export function VmFrame({ sessionKey, onAgent, onFrame, onPhase }: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [src, setSrc] = useState<string>("");
  const [busy, setBusy] = useState("Preparing the environment…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSrc("");
    onPhase("image", "Preparing the environment…");
    setBusy("Preparing the environment…");

    (async () => {
      try {
        // The iframe downloads the immutable overlay itself (see the patched
        // lotPull in public/vm/index.html). The parent only verifies that the
        // image metadata is present so it can show a useful error.
        const res = await fetch(OVERLAY_META_URL, { cache: "no-store" });
        const type = res.headers.get("content-type") || "";
        if (!res.ok || !type.includes("json")) {
          throw new Error(
            "Environment image is missing. Run `npm run build:overlay` (see README).",
          );
        }
        if (cancelled) return;
        setBusy("Booting Linux…");
        onPhase("boot");
        setSrc(buildVmUrl() + `&session=${sessionKey}&t=${Date.now()}`);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        onPhase("error", String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionKey, onPhase]);

  const handleLoad = async () => {
    const frame = frameRef.current;
    if (!frame || !src) return;
    try {
      injectCss(frame);
      onFrame(frame);
      setBusy("Starting the guest agent…");
      onPhase("agent");
      const agent = await waitForAgent(frame, 90_000);
      setBusy("Ready");
      onPhase("ready");
      onAgent(agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onPhase("error", String(err));
    }
  };

  return (
    <div className="vm-frame">
      {src ? (
        <iframe
          ref={frameRef}
          title="LinuxOnTab"
          src={src}
          onLoad={handleLoad}
          allow="clipboard-read; clipboard-write"
        />
      ) : null}
      {!src || busy !== "Ready" ? (
        <div className="vm-cover">
          <div className="vm-mark">
            <TerminalSquare size={24} />
          </div>
          {error ? (
            <>
              <div className="vm-error">VM failed to start</div>
              <div className="vm-error-detail">{error}</div>
            </>
          ) : (
            <>
              <Loader2 className="spin" size={16} />
              <span>{busy}</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
