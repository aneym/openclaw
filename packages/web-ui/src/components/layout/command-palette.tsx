import { useEffect, useState } from 'react'
import { MessageSquare, Plus } from 'lucide-react'
import { useSession } from '@/providers/session-provider'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { sessions, setSessionKey, newSession } = useSession()

  // Cmd+K to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const filtered = sessions.filter((s) => {
    if (!search) return true
    const label = s.label || s.displayName || s.key
    return label.toLowerCase().includes(search.toLowerCase())
  })

  const handleSelect = (key: string) => {
    setSessionKey(key)
    setOpen(false)
    setSearch('')
  }

  const handleNew = () => {
    newSession()
    setOpen(false)
    setSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-md">
        <div className="border-b p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="border-0 bg-transparent p-0 text-sm focus-visible:ring-0 shadow-none"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button
            onClick={handleNew}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span>New Session</span>
          </button>
          {filtered.map((session) => (
            <button
              key={session.key}
              onClick={() => handleSelect(session.key)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">
                {session.label || session.displayName || session.key}
              </span>
            </button>
          ))}
          {filtered.length === 0 && search && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No sessions found
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
