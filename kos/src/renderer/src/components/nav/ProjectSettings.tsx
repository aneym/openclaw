import { useState } from 'react'
import { Check, Folder, Hash, Settings, Trash2, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Checkbox } from '../ui/checkbox'
import { useProjectStore } from '@/stores/project-store'
import type { Project } from '@/types'

interface ProjectSettingsProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Emoji picker (simple for now)
const EMOJI_OPTIONS = [
  '📦', '🎯', '🚀', '💻', '🎨', '📱', '⚡', '🔧', '🛠', '📊',
  '🎮', '🌟', '💡', '🔥', '🎭', '🎪', '🎨', '🎬', '🎤', '🎧'
]

// Color picker (simple for now)
const COLOR_OPTIONS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Gray', value: '#6b7280' }
]

// Mock Linear teams (in real app, fetch from Linear API)
const MOCK_LINEAR_TEAMS = [
  { id: 'team_kos', name: 'KOS' },
  { id: 'team_eng', name: 'Engineering' },
  { id: 'team_design', name: 'Design' }
]

// Mock skills (in real app, fetch from gateway)
const MOCK_SKILLS = [
  { id: 'skill_code', name: 'Code Generation' },
  { id: 'skill_review', name: 'Code Review' },
  { id: 'skill_debug', name: 'Debugging' },
  { id: 'skill_test', name: 'Test Generation' },
  { id: 'skill_docs', name: 'Documentation' },
  { id: 'skill_refactor', name: 'Refactoring' }
]

export function ProjectSettings({ project, open, onOpenChange }: ProjectSettingsProps) {
  const updateProject = useProjectStore((s) => s.updateProject)

  // Local state for form
  const [name, setName] = useState(project.name)
  const [icon, setIcon] = useState(project.icon || '📦')
  const [color, setColor] = useState(project.color || COLOR_OPTIONS[0].value)
  const [linearTeamId, setLinearTeamId] = useState(project.linearTeamId || '')
  const [repoPath, setRepoPath] = useState(project.repoPath || '')
  const [skills, setSkills] = useState<string[]>(project.skills || [])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const handleSave = () => {
    updateProject(project.id, {
      name,
      icon,
      color,
      linearTeamId: linearTeamId || undefined,
      repoPath: repoPath || undefined,
      skills
    })
    onOpenChange(false)
  }

  const handleCancel = () => {
    // Reset to original values
    setName(project.name)
    setIcon(project.icon || '📦')
    setColor(project.color || COLOR_OPTIONS[0].value)
    setLinearTeamId(project.linearTeamId || '')
    setRepoPath(project.repoPath || '')
    setSkills(project.skills || [])
    onOpenChange(false)
  }

  const handleSelectRepoPath = async () => {
    // Use Electron dialog to select directory
    if (window.api?.openDirectoryDialog) {
      try {
        const result = await window.api.openDirectoryDialog()
        if (result && !result.canceled && result.filePaths[0]) {
          setRepoPath(result.filePaths[0])
        }
      } catch (err) {
        console.error('Failed to open directory dialog:', err)
      }
    } else {
      // Fallback: manual entry for web environment
      const path = prompt('Enter repository path:')
      if (path) setRepoPath(path)
    }
  }

  const toggleSkill = (skillId: string) => {
    setSkills((prev) =>
      prev.includes(skillId)
        ? prev.filter((s) => s !== skillId)
        : [...prev, skillId]
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Project Settings</SheetTitle>
          <SheetDescription>
            Configure project name, icon, Linear integration, and skills
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
            />
          </div>

          {/* Icon Picker */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="relative">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                <span className="text-2xl mr-2">{icon}</span>
                <span className="text-muted-foreground">Choose emoji</span>
              </Button>

              {showEmojiPicker && (
                <div className="absolute z-10 mt-2 p-2 bg-popover border rounded-md shadow-lg grid grid-cols-10 gap-1">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      className="text-2xl hover:bg-accent p-1 rounded"
                      onClick={() => {
                        setIcon(emoji)
                        setShowEmojiPicker(false)
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`w-8 h-8 rounded border-2 ${
                    color === opt.value ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: opt.value }}
                  onClick={() => setColor(opt.value)}
                  title={opt.name}
                />
              ))}
            </div>
          </div>

          {/* Linear Team Connection */}
          <div className="space-y-2">
            <Label htmlFor="linear-team">
              <Hash className="inline w-4 h-4 mr-1" />
              Linear Team
            </Label>
            <Select value={linearTeamId} onValueChange={setLinearTeamId}>
              <SelectTrigger id="linear-team">
                <SelectValue placeholder="Select Linear team..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {MOCK_LINEAR_TEAMS.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Link this project to a Linear team to see the kanban board
            </p>
          </div>

          {/* Repository Path */}
          <div className="space-y-2">
            <Label htmlFor="repo-path">
              <Folder className="inline w-4 h-4 mr-1" />
              Repository Path
            </Label>
            <div className="flex gap-2">
              <Input
                id="repo-path"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="/path/to/repo"
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectRepoPath}>
                Browse
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Local path to the project's git repository
            </p>
          </div>

          {/* Enabled Skills */}
          <div className="space-y-2">
            <Label>
              <Settings className="inline w-4 h-4 mr-1" />
              Enabled Skills
            </Label>
            <div className="space-y-2 border rounded-md p-3">
              {MOCK_SKILLS.map((skill) => (
                <div key={skill.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`skill-${skill.id}`}
                    checked={skills.includes(skill.id)}
                    onCheckedChange={() => toggleSkill(skill.id)}
                  />
                  <Label
                    htmlFor={`skill-${skill.id}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {skill.name}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Select which AI skills are available for this project
            </p>
          </div>

          {/* Archive Project */}
          <div className="pt-4 border-t">
            <Button variant="destructive" className="w-full" disabled>
              <Trash2 className="w-4 h-4 mr-2" />
              Archive Project
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Archiving will hide this project and its threads
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button variant="outline" className="flex-1" onClick={handleCancel}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            <Check className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
