import type { Variants, Transition } from "./motion";

// Clean easing - no bounce, smooth deceleration
// From motion MCP: spring with bounce=0, perceptual duration 0.2s
export const cleanEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Shared transition presets - clean and subtle
export const fastTransition: Transition = {
  duration: 0.15,
  ease: cleanEase,
};

export const normalTransition: Transition = {
  duration: 0.2,
  ease: cleanEase,
};

// Fade in - simple opacity
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: fastTransition },
  exit: { opacity: 0, transition: fastTransition },
};

// Collapse/expand with height animation (for sidebar groups)
export const collapse: Variants = {
  initial: { height: 0, opacity: 0, overflow: "hidden" },
  animate: {
    height: "auto",
    opacity: 1,
    overflow: "hidden",
    transition: { duration: 0.2, ease: cleanEase },
  },
  exit: {
    height: 0,
    opacity: 0,
    overflow: "hidden",
    transition: { duration: 0.15, ease: cleanEase },
  },
};

// Scale in (for panels)
export const scaleIn: Variants = {
  initial: { scale: 0.98, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: fastTransition },
  exit: { scale: 0.98, opacity: 0, transition: fastTransition },
};

// Slide up (for messages entering)
export const slideUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: normalTransition },
};

// Slide in from left (for tool chips)
export const slideInLeft: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0, transition: normalTransition },
};

// Stagger children - for lists
export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.03,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: fastTransition },
};
