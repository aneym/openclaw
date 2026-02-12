const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i;
const MEDIA_LINE_RE = /^\s*MEDIA:\s*(.+?)\s*$/i;
const GENERIC_IMAGE_PATH_RE =
  /(?:^|[\s("'`])((?:\/|~\/|[A-Za-z]:\\)[^"'`<>]+?\.(?:png|jpe?g|webp|gif|svg))(?=$|[\s)"'`,])/gim;

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function normalizePathCandidate(raw: string): string | null {
  let value = raw.trim();
  if (!value) {
    return null;
  }

  while (value.length > 0 && "`\"'(<[".includes(value[0] ?? "")) {
    value = value.slice(1);
  }
  while (value.length > 0 && "`\"')>],;:.".includes(value.at(-1) ?? "")) {
    value = value.slice(0, -1);
  }
  if (!value) {
    return null;
  }

  if (/^file:\/\//i.test(value)) {
    try {
      const fileUrl = new URL(value);
      return decodeURIComponent(fileUrl.pathname);
    } catch {
      return null;
    }
  }

  return value;
}

export function isImagePath(value: string): boolean {
  return IMAGE_EXT_RE.test(value.trim());
}

export type MediaLineExtraction = {
  cleanedText: string;
  mediaPaths: string[];
};

export function extractMediaLines(text: string): MediaLineExtraction {
  const lines = text.split(/\r?\n/);
  const mediaPaths: string[] = [];
  const keptLines: string[] = [];

  for (const line of lines) {
    const match = line.match(MEDIA_LINE_RE);
    if (!match) {
      keptLines.push(line);
      continue;
    }
    const candidate = normalizePathCandidate(match[1] ?? "");
    if (candidate) {
      mediaPaths.push(candidate);
    }
  }

  return {
    cleanedText: keptLines.join("\n").trim(),
    mediaPaths: unique(mediaPaths),
  };
}

export function extractImagePathsFromText(text: string): string[] {
  const mediaExtract = extractMediaLines(text);
  const matches: string[] = [...mediaExtract.mediaPaths];

  let match: RegExpExecArray | null = null;
  GENERIC_IMAGE_PATH_RE.lastIndex = 0;
  while ((match = GENERIC_IMAGE_PATH_RE.exec(text)) !== null) {
    const candidate = normalizePathCandidate(match[1] ?? "");
    if (candidate && isImagePath(candidate)) {
      matches.push(candidate);
    }
  }

  return unique(matches);
}
