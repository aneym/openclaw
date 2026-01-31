#!/usr/bin/env node

/**
 * PostToolUse hook: Auto-fix noise comments after edits
 *
 * Runs after Write/Edit/MultiEdit, detects noise comments in the modified file,
 * and automatically removes them. Reports what was fixed.
 */

const fs = require('fs')
const path = require('path')

const LLM_NOISE_PATTERNS = [
  /^\/\/\s*(?:This|Here we|Now let['']s|Now we|Let['']s|We)\s/i,
  /^\/\/\s*(?:Get|Set|Create|Update|Delete|Handle|Process|Return|Loop|Iterate|Check|Call|Send|Fetch|Load|Save|Store|Read|Write|Parse|Convert|Transform|Validate|Initialize|Setup|Configure)\s+(?:the|a|an)?\s*\w+/i,
  /^\/\/\s*(?:Increment|Decrement|Add|Subtract|Assign|Initialize|Declare|Define|Import|Export|Render)\s+/i,
  /^\/\/\s*(?:Gets?|Sets?|Creates?|Updates?|Deletes?|Returns?|Handles?|Processes?)\s+/i,
  /^\/\*\*?\s*(?:This|Here we|Now let['']s|Now we|Let['']s|We)\s/i,
  /^\s*\*\s*(?:This|Here we|Now let['']s|Now we|Let['']s|We)\s/i,
  /^\/\/\s*(?:Done|End|Start|Begin|Continue|Next|Proceed|Execute|Run|Finish|Complete)\s*$/i,
  /^\/\/\s*$/,
  /^\/\/\s*end\s+(?:of\s+)?(?:function|method|class|if|else|for|while|switch|try|catch)\s*$/i,
]

const ALLOWLIST_PATTERNS = [
  /because|since|due to|in order to|so that|otherwise/i,
  /workaround|hack|bug|issue|limitation|constraint|edge case/i,
  /TODO|FIXME|HACK|NOTE|WARNING|IMPORTANT|XXX|BUG/i,
  /rate.?limit|API|SDK|library|framework|deprecated|legacy/i,
  /https?:\/\//i,
  /\b[A-Z]+-\d+\b/i,
  /performance|optimization|cache|memory|latency|benchmark/i,
  /security|XSS|injection|auth|permission|sensitive/i,
  /version|v\d|deprecated|migration|backward.?compat/i,
  /TypeScript|type.?guard|type.?assertion|type.?inference|generic/i,
  /business|requirement|spec|design|decision/i,
  /intentionally|deliberately|explicitly|purposely/i,
  /see\s+(?:also|:|file|related)/i,
]

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'])

function isCodeFile(filePath) {
  if (!filePath) return false
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function isNoiseComment(line) {
  for (const pattern of ALLOWLIST_PATTERNS) {
    if (pattern.test(line)) return false
  }
  for (const pattern of LLM_NOISE_PATTERNS) {
    if (pattern.test(line)) return true
  }
  return false
}

function findAndRemoveNoiseComments(content) {
  const lines = content.split('\n')
  const cleanedLines = []
  const removed = []
  let inBlockComment = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false
      if (trimmed.startsWith('*') && !trimmed.startsWith('*/') && isNoiseComment(trimmed)) {
        removed.push(trimmed)
        continue
      }
      cleanedLines.push(line)
      continue
    }

    if (trimmed.startsWith('/*')) {
      inBlockComment = !trimmed.includes('*/')
      if (isNoiseComment(trimmed)) {
        removed.push(trimmed)
        continue
      }
      cleanedLines.push(line)
      continue
    }

    if (trimmed.startsWith('//') && isNoiseComment(trimmed)) {
      removed.push(trimmed)
      continue
    }

    cleanedLines.push(line)
  }

  return { cleaned: cleanedLines.join('\n'), removed }
}

function extractFilePath(toolInput) {
  if (!toolInput) return null
  if (toolInput.file_path) return toolInput.file_path
  if (toolInput.edits && Array.isArray(toolInput.edits)) {
    const paths = toolInput.edits.map(e => e.file_path).filter(Boolean)
    return paths[0] || null
  }
  return null
}

function main() {
  let inputData = ''

  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => { inputData += chunk })

  process.stdin.on('end', () => {
    try {
      const hookData = JSON.parse(inputData)
      const toolInput = hookData.tool_input || {}
      const filePath = extractFilePath(toolInput)

      if (!filePath || !isCodeFile(filePath)) {
        process.exit(0)
        return
      }

      let content
      try {
        content = fs.readFileSync(filePath, 'utf8')
      } catch {
        process.exit(0)
        return
      }

      const { cleaned, removed } = findAndRemoveNoiseComments(content)

      if (removed.length === 0) {
        process.exit(0)
        return
      }

      fs.writeFileSync(filePath, cleaned, 'utf8')

      const filename = path.basename(filePath)
      let message = `🧹 AUTO-FIXED: Removed ${removed.length} noise comment${removed.length > 1 ? 's' : ''} from ${filename}:\n`
      for (const r of removed.slice(0, 5)) {
        const display = r.length > 50 ? r.slice(0, 47) + '...' : r
        message += `  - ${display}\n`
      }
      if (removed.length > 5) {
        message += `  ... and ${removed.length - 5} more\n`
      }

      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: message,
        },
      }))

      process.exit(0)
    } catch {
      process.exit(0)
    }
  })
}

main()
