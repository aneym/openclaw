import { create } from "zustand";

export interface ArtifactFile {
  path: string;
  content: string;
  language: string;
  lastModified: number;
}

interface ArtifactState {
  files: Map<string, ArtifactFile>;
  activeFilePath: string | null;

  addFile: (path: string, content: string) => void;
  updateFile: (path: string, content: string) => void;
  setActiveFile: (path: string) => void;
  removeFile: (path: string) => void;
  clear: () => void;
}

/** Detect language from file extension for syntax highlighting */
function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    cs: "csharp",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    md: "markdown",
    mdx: "markdown",
    dockerfile: "dockerfile",
    graphql: "graphql",
    gql: "graphql",
    vue: "html",
    svelte: "html",
  };
  return langMap[ext] ?? "plaintext";
}

export const useArtifactStore = create<ArtifactState>((set, get) => ({
  files: new Map(),
  activeFilePath: null,

  addFile: (path: string, content: string) => {
    const files = new Map(get().files);
    files.set(path, {
      path,
      content,
      language: detectLanguage(path),
      lastModified: Date.now(),
    });
    set({ files, activeFilePath: path });
  },

  updateFile: (path: string, content: string) => {
    const files = new Map(get().files);
    const existing = files.get(path);
    if (existing) {
      files.set(path, {
        ...existing,
        content,
        lastModified: Date.now(),
      });
    } else {
      files.set(path, {
        path,
        content,
        language: detectLanguage(path),
        lastModified: Date.now(),
      });
    }
    set({ files, activeFilePath: path });
  },

  setActiveFile: (path: string) => {
    if (get().files.has(path)) {
      set({ activeFilePath: path });
    }
  },

  removeFile: (path: string) => {
    const files = new Map(get().files);
    files.delete(path);
    const activePath = get().activeFilePath;
    // If we removed the active file, switch to the last remaining file
    const newActive =
      activePath === path ? (files.size > 0 ? [...files.keys()].pop()! : null) : activePath;
    set({ files, activeFilePath: newActive });
  },

  clear: () => {
    set({ files: new Map(), activeFilePath: null });
  },
}));
