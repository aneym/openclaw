# Animation Guidelines

kOS uses both CSS transitions and Motion (Framer Motion v12+). Choose based on the use case.

## When to Use CSS Transitions

Use pure CSS for **state-based transitions** where the element stays in the DOM:

- Hover/focus/active states
- Color, opacity, transform changes on existing elements
- Panel resize/collapse (react-resizable-panels)
- Accordion expand/collapse (Radix handles this)
- Any transition between two known states

```css
/* Example: sidebar collapse */
[data-panel-id="sidebar"] {
  transition: flex-basis 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

**Why CSS:** Simpler, no JS overhead, works with third-party libraries that manage their own DOM.

## When to Use Motion

Use Motion for **mount/unmount animations** and **complex orchestration**:

- Elements entering/leaving the DOM (`AnimatePresence`)
- List item additions/removals with stagger
- Layout animations (when elements reflow)
- Gesture-driven animations (drag, swipe)
- Coordinated multi-element sequences
- Height: auto animations (CSS can't animate to `auto`)

```tsx
import { motion, AnimatePresence } from '@/lib/motion'
import { fadeIn, collapse } from '@/lib/animation-variants'

// Mount/unmount animation
<AnimatePresence>
  {isVisible && (
    <motion.div variants={fadeIn} initial="initial" animate="animate" exit="exit">
      Content
    </motion.div>
  )}
</AnimatePresence>

// Height: auto collapse
<motion.div variants={collapse} initial="initial" animate="animate" exit="exit">
  {children}
</motion.div>
```

**Why Motion:** CSS can't animate elements being added/removed from DOM, can't animate to `height: auto`, and can't orchestrate sequences.

## Decision Table

| Scenario                                  | Use                    |
| ----------------------------------------- | ---------------------- |
| Hover/focus effects                       | CSS                    |
| Button press feedback                     | CSS                    |
| Sidebar collapse (react-resizable-panels) | CSS                    |
| Dialog/modal open (Radix)                 | CSS (Radix handles it) |
| Toast notifications entering/leaving      | Motion                 |
| Chat messages appearing                   | Motion                 |
| List items reordering                     | Motion                 |
| Collapsible section (height: auto)        | Motion                 |
| Skeleton → content transition             | Motion                 |
| Drag-to-reorder                           | Motion                 |

## Shared Easing

Use the same easing everywhere for consistency:

```ts
// CSS (cubic-bezier)
cubic - bezier(0.16, 1, 0.3, 1);

// Motion (same curve)
import { cleanEase } from "@/lib/animation-variants";
```

This is a smooth deceleration curve with no bounce — equivalent to a spring with `bounce: 0, duration: 0.2s`.

## Duration Guidelines

| Speed  | Duration  | Use for                          |
| ------ | --------- | -------------------------------- |
| Fast   | 150ms     | Micro-interactions, hover states |
| Normal | 200ms     | Most UI transitions              |
| Slow   | 300-400ms | Large layout shifts, modals      |

## Performance Rules

1. **Only animate transform and opacity** when possible — these are GPU-accelerated
2. **Avoid animating layout properties** (width, height, padding) in CSS — use Motion's layout animations instead
3. **Use `will-change` sparingly** — only for elements that animate frequently
4. **Prefer CSS for high-frequency animations** (60fps scroll effects) — less JS overhead

## Existing Variants

Use variants from `@/lib/animation-variants.ts`:

- `fadeIn` — simple opacity fade
- `collapse` — height: auto with opacity
- `scaleIn` — subtle scale + opacity (panels)
- `slideUp` — messages entering
- `slideInLeft` — tool chips
- `staggerContainer` / `staggerItem` — list animations
