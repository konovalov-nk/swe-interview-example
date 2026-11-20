import solutionPy from "../../challenge/senior/solution.py?raw";
import readmeMd from "../../challenge/senior/README.md?raw";
import runTestsSh from "../../challenge/senior/run_tests.sh?raw";
import testsInit from "../../challenge/senior/tests/__init__.py?raw";
import testsPy from "../../challenge/senior/tests/test_solution.py?raw";
import smokePy from "../../challenge/senior/legacy_tests/test_smoke.py?raw";
import testsSolution from "../../challenge/senior/tests/solution.py?raw";

export type FileSpec = {
  path: string;
  content: string;
  language: string;
};

export type TreeNode = {
  name: string;
  path?: string;
  kind: "file" | "dir" | "symlink";
  language?: string;
  children?: TreeNode[];
};

export const WORKSPACE = "/root/work";
export const TASK_MARKDOWN = readmeMd;

export const FILES: FileSpec[] = [
  { path: "solution.py", content: solutionPy, language: "python" },
  { path: "README.md", content: readmeMd, language: "markdown" },
  { path: "run_tests.sh", content: runTestsSh, language: "shell" },
  { path: "tests/__init__.py", content: testsInit, language: "python" },
  { path: "tests/test_solution.py", content: testsPy, language: "python" },
  { path: "legacy_tests/test_smoke.py", content: smokePy, language: "python" },
  { path: "tests/solution.py", content: testsSolution, language: "python" },
];

export const FILE_BY_PATH = new Map(FILES.map((f) => [f.path, f]));

export const TREE: TreeNode[] = [
  {
    name: "work",
    kind: "dir",
    children: [
      { name: "solution.py", path: "solution.py", kind: "file", language: "python" },
      { name: "README.md", path: "README.md", kind: "file", language: "markdown" },
      { name: "run_tests.sh", path: "run_tests.sh", kind: "file", language: "shell" },
      {
        name: "tests",
        kind: "dir",
        children: [
          { name: "__init__.py", path: "tests/__init__.py", kind: "file", language: "python" },
          {
            name: "test_solution.py",
            path: "tests/test_solution.py",
            kind: "file",
            language: "python",
          },
          {
            name: "solution.py",
            path: "tests/solution.py",
            kind: "file",
            language: "python",
          },
        ],
      },
      {
        name: "legacy_tests",
        kind: "dir",
        children: [
          {
            name: "test_smoke.py",
            path: "legacy_tests/test_smoke.py",
            kind: "file",
            language: "python",
          },
        ],
      },
    ],
  },
];

export const TEST_NAMES = [
  "test_single_reachable",
  "test_single_unreachable",
  "test_mixed",
  "test_empty",
  "test_duplicates",
  "test_order",
  "test_invalid_ip",
  "test_invalid_port_high",
  "test_invalid_port_negative",
  "test_ipv6_reachable",
  "test_ipv6_unreachable",
  "test_ipv4_mapped",
  "test_many_hosts",
  "test_timeout_value",
  "test_concurrent",
  "test_no_fd_leak",
  "test_returns_dict",
  "test_all_keys",
  "test_global_timeout",
  "test_thread_safe",
] as const;

export function languageFor(path: string): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".sh")) return "shell";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".json")) return "json";
  return "text";
}

export function isTaskFile(path: string): boolean {
  return path === "README.md";
}

export function isSolutionFile(path: string): boolean {
  return path === "solution.py";
}

export function isTestFile(path: string): boolean {
  return path.startsWith("tests/") || path.startsWith("legacy_tests/");
}
