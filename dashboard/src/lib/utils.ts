import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// `text-sm-tight` is a CUSTOM font-size token (see --text-sm-tight in index.css).
// Plain tailwind-merge doesn't know `sm-tight` is a size, so it misreads
// `text-sm-tight` as a text-COLOR utility and strips any earlier text color
// (e.g. the `text-primary-foreground` from the default/glow button variants),
// leaving sm buttons with unreadable inherited light text on the lime gradient.
// Registering it in the `font-size` group fixes the conflict resolution.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["sm-tight"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
