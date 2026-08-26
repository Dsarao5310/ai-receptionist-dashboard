"use client";

import { useReducedMotion, type Variants } from "framer-motion";

/**
 * Shared entrance-animation variants for dashboard sections.
 *
 * A coordinated fade+rise reads as one considered reveal rather than content
 * just appearing; `staggerChildren` on the container is what makes it read as
 * a sequence instead of everything happening at once.
 *
 * `useSectionMotion` returns motion-ready props that collapse to a no-op when
 * the visitor has requested reduced motion — framer-motion animations do not
 * respect the CSS `prefers-reduced-motion` block in globals.css on their own,
 * so this reads the same OS setting through framer-motion's own hook.
 */
const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.02 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

const reducedVariants: Variants = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0 },
};

export function useSectionMotion() {
  const reduced = useReducedMotion();
  return {
    container: {
      variants: reduced ? reducedVariants : containerVariants,
      initial: "hidden",
      animate: "show",
    },
    item: {
      variants: reduced ? reducedVariants : itemVariants,
    },
  };
}
