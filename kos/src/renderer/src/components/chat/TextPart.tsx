import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
// Register common languages for syntax highlighting
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { marked } from "marked";
import { useMemo } from "react";
import { useCodeBlockEnhancement } from "../../hooks/use-code-block-enhancement";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("go", go);

// Configure marked with highlight.js
const renderer = new marked.Renderer();

renderer.code = ({ text, lang }: { text: string; lang?: string; escaped?: boolean }) => {
  const code = text;
  const language = lang || "";
  let highlighted = code;

  if (language && hljs.getLanguage(language)) {
    try {
      highlighted = hljs.highlight(code, { language }).value;
    } catch {
      // Fallback to auto-detection
      highlighted = hljs.highlightAuto(code).value;
    }
  } else {
    // Auto-detect language
    try {
      highlighted = hljs.highlightAuto(code).value;
    } catch {
      // Fallback to plain text
      highlighted = code;
    }
  }

  // Add copy button wrapper with data attributes for the language and raw code
  return `<div class="code-block-wrapper" data-code="${encodeURIComponent(code)}" data-lang="${language}">
    <pre><code class="hljs language-${language}">${highlighted}</code></pre>
  </div>`;
};

marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
});

interface TextPartProps {
  text: string;
  isStreaming?: boolean;
}

export function TextPart({ text, isStreaming }: TextPartProps) {
  const html = useMemo(() => {
    if (isStreaming && text.length < 100) {
      // Simple render during early streaming (no markdown overhead)
      return DOMPurify.sanitize(text.replace(/\n/g, "<br>"));
    }

    const parsed = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(parsed);
  }, [text, isStreaming]);

  // Use the hook to enhance code blocks with copy buttons and language labels
  const handleRef = useCodeBlockEnhancement();

  return (
    <div
      ref={handleRef}
      className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:before:content-none prose-code:after:content-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
