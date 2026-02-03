import { useMemo, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'

// Register common languages for syntax highlighting
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import sql from 'highlight.js/lib/languages/sql'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('go', go)

// Configure marked with highlight.js
const renderer = new marked.Renderer()

renderer.code = ({ text, lang }: { text: string; lang?: string; escaped?: boolean }) => {
  const code = text
  const language = lang || ''
  let highlighted = code

  if (language && hljs.getLanguage(language)) {
    try {
      highlighted = hljs.highlight(code, { language }).value
    } catch {
      // Fallback to auto-detection
      highlighted = hljs.highlightAuto(code).value
    }
  } else {
    // Auto-detect language
    try {
      highlighted = hljs.highlightAuto(code).value
    } catch {
      // Fallback to plain text
      highlighted = code
    }
  }

  // Add copy button wrapper with data attributes for the language and raw code
  return `<div class="code-block-wrapper" data-code="${encodeURIComponent(code)}" data-lang="${language}">
    <pre><code class="hljs language-${language}">${highlighted}</code></pre>
  </div>`
}

marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
})

interface TextPartProps {
  text: string
  isStreaming?: boolean
}

export function TextPart({ text, isStreaming }: TextPartProps) {
  const html = useMemo(() => {
    if (isStreaming && text.length < 100) {
      // Simple render during early streaming (no markdown overhead)
      return DOMPurify.sanitize(text.replace(/\n/g, '<br>'))
    }

    const parsed = marked.parse(text, { async: false }) as string
    return DOMPurify.sanitize(parsed)
  }, [text, isStreaming])

  // After rendering, find all code blocks and add copy buttons
  const handleRef = useCallback((container: HTMLDivElement | null) => {
    if (!container) return

    const codeBlocks = container.querySelectorAll('.code-block-wrapper')
    codeBlocks.forEach((block) => {
      const htmlBlock = block as HTMLElement
      const encodedCode = htmlBlock.dataset.code
      const lang = htmlBlock.dataset.lang || ''

      if (encodedCode && !htmlBlock.querySelector('.copy-button-container')) {
        try {
          const code = decodeURIComponent(encodedCode)

          // Add group class for hover effect
          htmlBlock.classList.add('group', 'relative')

          // Create button container
          const buttonContainer = document.createElement('div')
          buttonContainer.className = 'copy-button-container'

          // Create language label
          if (lang) {
            const langLabel = document.createElement('div')
            langLabel.className =
              'absolute top-2 left-2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded border border-border'
            langLabel.textContent = lang
            htmlBlock.appendChild(langLabel)
          }

          // We'll inject the React copy button via portal or directly
          // For now, create a simple native button
          const copyButton = document.createElement('button')
          copyButton.className =
            'absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity'
          copyButton.setAttribute('aria-label', 'Copy code')
          copyButton.setAttribute('title', 'Copy code')
          copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`

          copyButton.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(code)
              copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><path d="M20 6 9 17l-5-5"/></svg>`
              setTimeout(() => {
                copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2 2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
              }, 2000)
            } catch (err) {
              console.error('Failed to copy code:', err)
            }
          })

          htmlBlock.appendChild(copyButton)
        } catch (err) {
          console.error('Failed to decode code:', err)
        }
      }
    })
  }, [])

  return (
    <div
      ref={handleRef}
      className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-code:before:content-none prose-code:after:content-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
