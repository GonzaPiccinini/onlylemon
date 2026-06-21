import { useEffect, useState } from "react";
import { chatService, type ChatScope } from "@/api/chat.service";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches a media message's bytes via the worker proxy and exposes an
 * object URL for use in `<img src>` or `<video src>`.
 *
 * The object URL is created via `URL.createObjectURL` and revoked when:
 *   - The component unmounts.
 *   - Any of the parameters change (a new URL is created for the new params).
 *
 * Why a Blob instead of a plain URL? The worker GET .../media route only
 * accepts an Authorization header — not a ?token= query param — so a bare
 * `<img src>` cannot authenticate.  We fetch through Axios (which injects
 * Bearer automatically) and create an object URL from the resulting Blob.
 * See `chat.service.ts` → `fetchMediaBlob` for details.
 *
 * @param scope       Current chat scope.
 * @param sessionId   WhatsappSession DB id.
 * @param chatId      Chat id.
 * @param messageId   Message id whose media to fetch.
 * @param enabled     Set to false to skip fetching (e.g. when hasMedia=false).
 *
 * @returns `{ objectUrl, isLoading, isError }`.
 *   - `objectUrl` is null until the fetch completes (or if the worker returns 404).
 *   - `isLoading` is true while the fetch is in-flight.
 *   - `isError` is true if the fetch failed with a non-404 error.
 */
export const useMediaBlob = (
  scope: ChatScope,
  sessionId: string | null,
  chatId: string | null,
  messageId: string | null,
  enabled = true,
): { objectUrl: string | null; isLoading: boolean; isError: boolean } => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!enabled || !sessionId || !chatId || !messageId) {
      return;
    }

    let revoked = false;
    let createdUrl: string | null = null;

    setIsLoading(true);
    setIsError(false);
    setObjectUrl(null);

    chatService
      .fetchMediaBlob(scope, sessionId, chatId, messageId)
      .then((blob) => {
        if (revoked) return;
        if (blob) {
          createdUrl = URL.createObjectURL(blob);
          setObjectUrl(createdUrl);
        } else {
          // 404 — media unavailable; objectUrl stays null (placeholder)
          setObjectUrl(null);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (revoked) return;
        setIsError(true);
        setIsLoading(false);
      });

    return () => {
      revoked = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
        createdUrl = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId, chatId, messageId, scope.kind, (scope as { cashierId?: string }).cashierId]);

  return { objectUrl, isLoading, isError };
};
