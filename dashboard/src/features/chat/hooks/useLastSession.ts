import { useCallback } from "react";
import type { ChatScope } from "@/api/chat.service";

// ---------------------------------------------------------------------------
// Storage key builders (Design Addendum §Session selector persistence)
// ---------------------------------------------------------------------------

function lastSessionKey(scope: ChatScope): string {
  if (scope.kind === "cashier") {
    // Key includes "cashier" but NOT a cashierId — the JWT carries it.
    // To avoid collisions between cashier accounts on the same browser,
    // we use a stable fixed key per role rather than per-user-id.
    // If the calling component has the cashierId available it should be
    // passed via an admin scope with kind="admin".
    return "chat:last-session:cashier";
  }
  // Admin scope: keyed per viewed cashier so each cashier remembers its own.
  return `chat:last-session:admin:${scope.cashierId}`;
}

function lastChatKey(scope: ChatScope, sessionId: string): string {
  if (scope.kind === "cashier") {
    return `chat:last-chat:cashier:session:${sessionId}`;
  }
  return `chat:last-chat:cashier:${scope.cashierId}:session:${sessionId}`;
}

// ---------------------------------------------------------------------------
// useLastSession
// ---------------------------------------------------------------------------

/**
 * Reads and writes the last-selected session id for the current scope.
 *
 * Key format (Design Addendum):
 *   - Cashier: `chat:last-session:cashier`
 *   - Admin (per viewed cashier): `chat:last-session:admin:<cashierId>`
 *
 * The hook only handles persistence — the caller is responsible for:
 *   - Validating that `lastSessionId` is still in the current session list.
 *   - Falling back to auto-select / picker when the stored id is not valid.
 */
export const useLastSession = (
  scope: ChatScope,
): {
  lastSessionId: string | null;
  rememberSession: (sessionId: string) => void;
} => {
  const key = lastSessionKey(scope);

  const lastSessionId = (() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  })();

  const rememberSession = useCallback(
    (sessionId: string) => {
      try {
        localStorage.setItem(key, sessionId);
      } catch {
        // Storage quota exceeded or private browsing — ignore silently
      }
    },
    [key],
  );

  return { lastSessionId, rememberSession };
};

// ---------------------------------------------------------------------------
// useLastChat
// ---------------------------------------------------------------------------

/**
 * Reads and writes the last-opened chat id within a session.
 *
 * Key format (Design Addendum):
 *   - Cashier: `chat:last-chat:cashier:session:<sessionId>`
 *   - Admin:   `chat:last-chat:cashier:<cashierId>:session:<sessionId>`
 *
 * The caller validates that the stored chatId still exists in the current
 * chat list before using it.
 */
export const useLastChat = (
  scope: ChatScope,
  sessionId: string | null,
): {
  lastChatId: string | null;
  rememberChat: (chatId: string) => void;
} => {
  const key = sessionId ? lastChatKey(scope, sessionId) : null;

  const lastChatId = (() => {
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  })();

  const rememberChat = useCallback(
    (chatId: string) => {
      if (!key) return;
      try {
        localStorage.setItem(key, chatId);
      } catch {
        // Ignore storage errors silently
      }
    },
    [key],
  );

  return { lastChatId, rememberChat };
};
