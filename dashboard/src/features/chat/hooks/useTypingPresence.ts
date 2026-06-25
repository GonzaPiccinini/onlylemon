import { useCallback, useEffect, useRef } from "react";
import { chatService, type ChatScope } from "@/api/chat.service";
import type { TypingState } from "@/types/chat";

// ---------------------------------------------------------------------------
// Real-time typing presence
// ---------------------------------------------------------------------------
// Drives the WhatsApp "escribiendo…" indicator from the cashier's keystrokes.
//
// Model (leading + trailing debounce, NO heartbeat):
//   - First keystroke after being idle   → send `start` once.
//   - Each subsequent keystroke          → only re-arm the stop timer (no call).
//   - STOP_DEBOUNCE_MS with no keystroke  → send `stop` (back to idle).
//   - Typing again after a stop           → send `start` again.
//   - Send / chat switch / unmount        → send `stop` for the chat we were on.
//
// Best-effort: every call is fire-and-forget and failures are swallowed, so a
// flaky presence ping never disrupts the cashier or blocks a real send.

/** Delay after the last keystroke before we send `stop`. Decision: 500ms. */
const STOP_DEBOUNCE_MS = 500;

type TypingTarget = { scope: ChatScope; sessionId: string; chatId: string };

/** Fire-and-forget presence ping — cosmetic, so failures are ignored. */
function ping(target: TypingTarget, state: TypingState): void {
  void chatService
    .setTyping(target.scope, target.sessionId, target.chatId, state)
    .catch(() => {});
}

export function useTypingPresence(
  scope: ChatScope,
  sessionId: string,
  chatId: string,
) {
  // The chat a `start` is currently outstanding for, or null when idle. Held in
  // a ref so `stop` always targets the chat we actually started on — even after
  // the active chat changes underneath us.
  const activeRef = useRef<TypingTarget | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const target = activeRef.current;
    if (!target) return;
    activeRef.current = null;
    ping(target, "stop");
  }, []);

  const onType = useCallback(() => {
    // Trailing edge: (re)arm the stop timer on every keystroke.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(stop, STOP_DEBOUNCE_MS);

    // Leading edge: send `start` once, only when not already typing.
    if (!activeRef.current) {
      const target: TypingTarget = { scope, sessionId, chatId };
      activeRef.current = target;
      ping(target, "start");
    }
  }, [scope, sessionId, chatId, stop]);

  // On chat switch (or unmount) stop typing on the chat we were on — `stop`
  // targets activeRef, which still holds the previous chat at cleanup time.
  useEffect(() => stop, [sessionId, chatId, stop]);

  return { onType, stop };
}
