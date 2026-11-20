import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Link2,
} from "lucide-react";
import type { TreeNode } from "../lib/challenge";

type Props = {
  tree: TreeNode[];
  activePath: string;
  dirty: Set<string>;
  onOpen: (path: string) => void;
};

function iconFor(node: TreeNode, open: boolean) {
  if (node.kind === "dir") return open ? <FolderOpen size={14} /> : <Folder size={14} />;
  if (node.kind === "symlink") return <Link2 size={13} />;
  if (node.language === "markdown") return <FileText size={14} />;
  return <FileCode2 size={14} />;
}

function Row({
  node,
  depth,
  activePath,
  dirty,
  onOpen,
}: {
  node: TreeNode;
  depth: number;
  activePath: string;
  dirty: Set<string>;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isDir = node.kind === "dir";
  const isActive = node.path === activePath;

  return (
    <div className="tree-branch">
      <button
        className={`tree-row ${isActive ? "active" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          if (isDir) setOpen((v) => !v);
          else if (node.path) onOpen(node.path);
        }}
        title={node.kind === "symlink" ? "symlink — inspect where it points" : undefined}
      >
        <span className="tree-chevron">
          {isDir ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
        </span>
        <span className={`tree-icon ${node.kind}`}>{iconFor(node, open)}</span>
        <span className="tree-name">{node.name}</span>
        {node.kind === "symlink" ? <span className="tree-badge">link</span> : null}
        {node.path && dirty.has(node.path) ? <span className="dirty-dot" /> : null}
      </button>
      {isDir && open
        ? node.children?.map((child) => (
            <Row
              key={`${child.path ?? child.name}`}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              dirty={dirty}
              onOpen={onOpen}
            />
          ))
        : null}
    </div>
  );
}

export function FileTree({ tree, activePath, dirty, onOpen }: Props) {
  return (
    <div className="file-tree">
      <div className="explorer-title">
        <span>EXPLORER</span>
        <span className="explorer-dots">···</span>
      </div>
      <div className="workspace-title">
        <ChevronDown size={12} />
        <span>HEALTHCHECK</span>
      </div>
      {tree.map((node) => (
        <Row
          key={node.name}
          node={node}
          depth={0}
          activePath={activePath}
          dirty={dirty}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
