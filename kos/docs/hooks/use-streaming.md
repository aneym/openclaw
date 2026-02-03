# useStreaming Hook

## Overview

The `useStreaming` hook tracks real-time streaming state for a given session. It subscribes to gateway events and provides streaming text, status, and run ID to components.

## Location

`src/renderer/src/hooks/use-streaming.ts`

## API

```typescript
function useStreaming(sessionKey: string): StreamingState;

interface StreamingState {
  isStreaming: boolean; // Whether the session is currently streaming
  streamText: string; // Current streaming text content
  runId: string | null; // ID of the current run, null when not streaming
}
```

## Usage

```tsx
import { useStreaming } from "@/hooks/use-streaming";

function ChatPanel({ sessionKey }: { sessionKey: string }) {
  const { isStreaming, streamText, runId } = useStreaming(sessionKey);

  return (
    <div>
      {isStreaming && (
        <div className="streaming-indicator">
          <span>Streaming...</span>
          {streamText && <pre>{streamText}</pre>}
        </div>
      )}
    </div>
  );
}
```

## Implementation Details

### Event Subscriptions

The hook subscribes to the `agent` gateway event and processes different stream types:

1. **`agent` event with `stream: 'lifecycle'`** - Run start/end events
   - `phase: 'start'` → Sets `isStreaming` to true, captures `runId`
   - `phase: 'end'` or `phase: 'error'` → Sets `isStreaming` to false, clears state

2. **`agent` event with `stream: 'assistant'`** - Text streaming
   - `data.text` contains the text delta to append to `streamText`

### Streaming Detection

The hook uses the `stream` field from `agent` event payloads:

- `lifecycle` with `phase: 'start'` → streaming begins
- `assistant` with `data.text` → streaming content, update `streamText`
- `lifecycle` with `phase: 'end'` or `phase: 'error'` → streaming ended
- `runId` is tracked to identify the specific run

### State Management

The hook uses React's `useState` and `useEffect` with proper cleanup:

- Subscribes to events when `sessionKey` changes
- Unsubscribes on unmount or when dependencies change
- Uses functional state updates to avoid stale closure issues

## Gateway Protocol

The hook expects `agent` events with the following structure:

```typescript
// Agent lifecycle event
{
  runId: string;
  sessionKey: string;
  stream: "lifecycle";
  ts: number;
  data: {
    phase: "start" | "end" | "error";
  }
}

// Assistant streaming event
{
  runId: string;
  sessionKey: string;
  stream: "assistant";
  ts: number;
  data: {
    text: string; // Text delta
  }
}
```

## Integration

This hook is designed to work with:

- `MessageList` component (show streaming indicator)
- `MessageGroup` component (pass isStreaming flag)
- `ComposeBar` component (disable send while streaming)
- `MessageQueue` component (queue messages during streaming)

## Testing

See `use-streaming.example.tsx` for usage examples.

## Future Enhancements

- [ ] Add streaming delta tracking for incremental updates
- [ ] Support multiple simultaneous streams per session
- [ ] Add timing metrics (stream duration, chunks per second)
- [ ] Debounce rapid stream updates for performance
