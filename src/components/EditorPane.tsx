import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import { FileCode2, FileText, X } from "lucide-react";
import { languageFor } from "../lib/challenge";

type Props = {
  openTabs: string[];
  activePath: string;
  files: Record<string, string>;
  dirty: Set<string>;
  onChange: (path: string, value: string) => void;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onSave: (path: string) => void;
};

const editorOverride = EditorView.theme(
  {
    "&": {
      fontSize: "13px",
    },
    ".cm-content": {
      fontFamily:
        "'SFMono-Regular', ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
      lineHeight: "1.45",
      padding: "8px 0",
    },
    ".cm-scroller": { overflow: "auto" },
    "&.cm-focused": { outline: "none" },
  },
  { dark: true },
);

function extensionsFor(language: string) {
  if (language === "python") return [python()];
  if (language === "markdown") return [markdown()];
  if (language === "json") return [json()];
  if (language === "shell") return [StreamLanguage.define(shell)];
  return [];
}

function iconFor(path: string) {
  if (path.endsWith(".md")) return <FileText size={13} />;
  return <FileCode2 size={13} />;
}

export function EditorPane({
  openTabs,
  activePath,
  files,
  dirty,
  onChange,
  onSelect,
  onClose,
  onSave,
}: Props) {
  const language = languageFor(activePath);
  const extensions = useMemo(
    () => [
      ...extensionsFor(language),
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            onSave(activePath);
            return true;
          },
        },
      ]),
      editorOverride,
    ],
    [language, activePath, onSave],
  );

  const crumbs = activePath.split("/");
  const value = files[activePath] ?? "";

  return (
    <div className="editor-pane">
      <div className="tabs">
        {openTabs.map((path) => {
          const name = path.split("/").pop();
          return (
            <button
              key={path}
              className={`tab ${path === activePath ? "active" : ""}`}
              onClick={() => onSelect(path)}
              title={path}
            >
              <span className="tab-icon">{iconFor(path)}</span>
              <span>{name}</span>
              {dirty.has(path) ? <span className="tab-dirty" /> : null}
              <span
                className="tab-close"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(path);
                }}
              >
                <X size={12} />
              </span>
            </button>
          );
        })}
        <div className="tabs-fill" />
      </div>

      {openTabs.length > 0 ? (
        <>
          <div className="breadcrumbs">
            {crumbs.map((part, i) => (
              <span key={i}>
                {i > 0 ? <span className="crumb-sep">›</span> : null}
                {part}
              </span>
            ))}
          </div>
          <div className="editor-host">
            <CodeMirror
              value={value}
              height="100%"
              theme={vscodeDark}
              extensions={extensions}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: false,
                searchKeymap: true,
                tabSize: 4,
              }}
              onChange={(next) => onChange(activePath, next)}
            />
          </div>
        </>
      ) : (
        <div className="editor-empty">
          <FileCode2 size={28} />
          <p>Open a file from the explorer.</p>
        </div>
      )}
    </div>
  );
}
