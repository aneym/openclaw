interface ChatPanelProps {
  threadId: string
}

export function ChatPanel({ threadId }: ChatPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
      <p className="text-sm">Chat panel for thread {threadId}</p>
      <p className="text-xs mt-2">Chat UI will be implemented in Track 4</p>
    </div>
  )
}
