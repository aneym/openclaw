---
summary: "Workspace template for TOOLS.md"
read_when:
  - Bootstrapping a workspace manually
---

# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

If this file gets large, split it into `TOOLS.d/*.md` shards and keep this file as a short index.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

## Split Pattern (recommended for large notes)

Use this structure when notes start getting long:

```text
TOOLS.md
TOOLS.d/
  10-ssh.md
  20-cameras.md
  30-tts.md
```

OpenClaw injects `TOOLS.md` plus `TOOLS.d/**/*.md` (lexical order), and each file is truncated independently if needed.

---

Add whatever helps you do your job. This is your cheat sheet.
