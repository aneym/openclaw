import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useThreadStore } from '../../stores/thread-store'
import { Dialog, DialogContent } from '../ui/dialog'
import { MessageSquare, Clock } from 'lucide-react'
import { formatDistanceToNow } from '../../lib/date-utils'

interface ThreadSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ThreadSearch({ open, onOpenChange }: ThreadSearchProps) {
  const [search, setSearch] = useState('')
  const threads = useThreadStore((s) => Array.from(s.threads.values()))
  const setActiveThread = useThreadStore((s) => s.setActiveThread)

  // Filter non-archived threads
  const activeThreads = threads
    .filter((t) => t.status !== 'archived')
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)

  const handleSelect = (threadId: string) => {
    setActiveThread(threadId)
    onOpenChange(false)
    setSearch('')
  }

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch('')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-2xl">
        <Command className="rounded-lg border-0 shadow-none" shouldFilter={true}>
          <div className="flex items-center border-b px-3">
            <MessageSquare className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Search threads..."
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus:ring-0"
            />
          </div>
          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No threads found.
            </Command.Empty>
            {activeThreads.map((thread) => (
              <Command.Item
                key={thread.id}
                value={thread.title}
                onSelect={() => handleSelect(thread.id)}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{thread.title}</div>
                  {thread.subtitle && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {thread.subtitle}
                    </div>
                  )}
                </div>
                <div className="ml-3 flex items-center text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatDistanceToNow(thread.lastMessageAt)}
                </div>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
