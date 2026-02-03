/**
 * Example usage of the useStreaming hook.
 * This file demonstrates how to use the hook in a React component.
 * Delete this file once the hook is integrated into actual components.
 */

import { useStreaming } from './use-streaming'

export function StreamingExample({ sessionKey }: { sessionKey: string }) {
  const { isStreaming, streamText, runId } = useStreaming(sessionKey)

  return (
    <div>
      <div>Session: {sessionKey}</div>
      <div>Status: {isStreaming ? 'Streaming...' : 'Idle'}</div>
      {runId && <div>Run ID: {runId}</div>}
      {streamText && (
        <div>
          <strong>Streaming Text:</strong>
          <pre>{streamText}</pre>
        </div>
      )}
    </div>
  )
}
