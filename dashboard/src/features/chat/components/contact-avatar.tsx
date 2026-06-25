import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ContactAvatarProps {
  /** Size (and any spacing) override, e.g. "size-9" or "size-10". */
  className?: string;
  /** Initials, a single letter, or an icon to render inside the avatar. */
  children: ReactNode;
}

/**
 * Circular contact avatar using the Configuracion chip tint (primary/10 bg +
 * primary text). Shared by the cashier picker, the chat list rows and the chat
 * header so the look stays in sync across the WhatsApp feature.
 */
export const ContactAvatar = ({ className, children }: ContactAvatarProps) => {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
};
