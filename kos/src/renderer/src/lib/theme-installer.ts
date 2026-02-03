import type { ThemeDefinition } from '../types';

/**
 * Prettify a theme name: replace hyphens with spaces, title case.
 */
function prettifyName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface TweakcnThemeJson {
  name: string;
  cssVars: {
    theme?: Record<string, string>;
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

/**
 * Parse and validate a tweakcn theme JSON object.
 */
function parseThemeJson(json: unknown, source?: string): ThemeDefinition {
  const data = json as Record<string, unknown>;

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid theme data: not an object');
  }

  if (!data.name || typeof data.name !== 'string') {
    throw new Error('Invalid theme data: missing "name" field');
  }

  const cssVars = data.cssVars as TweakcnThemeJson['cssVars'] | undefined;
  if (!cssVars || typeof cssVars !== 'object') {
    throw new Error('Invalid theme data: missing "cssVars" field');
  }

  if (!cssVars.light || typeof cssVars.light !== 'object') {
    throw new Error('Invalid theme data: missing "cssVars.light" block');
  }

  if (!cssVars.dark || typeof cssVars.dark !== 'object') {
    throw new Error('Invalid theme data: missing "cssVars.dark" block');
  }

  return {
    id: data.name as string,
    name: prettifyName(data.name as string),
    source,
    isBuiltIn: false,
    cssVars: {
      theme: cssVars.theme,
      light: cssVars.light,
      dark: cssVars.dark,
    },
    installedAt: Date.now(),
  };
}

/**
 * Install a theme from a tweakcn.com URL or raw JSON string.
 *
 * @param input - A URL like https://tweakcn.com/r/themes/... or raw JSON string starting with '{'
 * @returns Parsed ThemeDefinition ready to be added to the store
 */
export async function installThemeFromUrl(input: string): Promise<ThemeDefinition> {
  const trimmed = input.trim();

  // Detect raw JSON input
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      return parseThemeJson(json);
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error('Invalid JSON: ' + e.message);
      }
      throw e;
    }
  }

  // Otherwise treat as URL
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL. Paste a tweakcn.com theme URL or raw JSON.');
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch theme: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  return parseThemeJson(json, url.toString());
}
