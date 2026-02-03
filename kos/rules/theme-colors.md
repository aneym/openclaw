# Theme Colors Rule

Use only theme CSS variables for colors in kOS. Never use Tailwind color utilities like `bg-blue-500`, `text-purple-400`, or `bg-gray-500`.

## Allowed Colors

```
bg-background / text-foreground
bg-primary / text-primary-foreground
bg-secondary / text-secondary-foreground
bg-muted / text-muted-foreground
bg-accent / text-accent-foreground
bg-destructive / text-destructive-foreground
bg-card / text-card-foreground
bg-popover / text-popover-foreground
border-border / border-input
ring-ring
```

## Examples

```tsx
// ❌ Wrong - hardcoded colors
<div className="bg-blue-500 text-white">
<span className="text-purple-400">
<div className="border-gray-300">

// ✅ Correct - theme variables
<div className="bg-primary text-primary-foreground">
<span className="text-accent-foreground">
<div className="border-border">
```

## Why

Theme variables ensure UI adapts to any installed theme. Hardcoded colors break when users switch themes.
