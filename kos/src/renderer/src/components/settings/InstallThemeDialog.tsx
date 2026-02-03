import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Plus, Loader2 } from 'lucide-react'
import { installThemeFromUrl } from '../../lib/theme-installer'
import { useTheme } from '../../hooks/use-theme'

export function InstallThemeDialog() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { installTheme, setTheme } = useTheme()

  const handleInstall = async () => {
    if (!input.trim()) return

    setLoading(true)
    setError(null)

    try {
      const theme = await installThemeFromUrl(input)
      installTheme(theme)
      setTheme(theme.id)
      setInput('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install theme')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setInput('')
      setError(null)
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-3 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary min-h-[88px]">
          <Plus className="h-6 w-6 mb-1" />
          <span className="text-sm font-medium">Add Theme</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install Theme</DialogTitle>
          <DialogDescription>
            Paste a tweakcn.com theme URL or raw JSON to install a new theme.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://tweakcn.com/r/themes/..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleInstall()
              }
            }}
            disabled={loading}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleInstall} disabled={loading || !input.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Installing...
                </>
              ) : (
                'Install'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
