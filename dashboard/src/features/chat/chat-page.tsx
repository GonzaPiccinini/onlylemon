/**
 * chat-page.tsx — Shared three-pane chat layout.
 *
 * Accepts a `scope` discriminator (cashier | admin) and a list of sessions.
 * Both role pages compose this component.
 *
 * Desktop layout: two visual columns.
 *   Left:  SessionPicker (top) + ChatList (below, scrollable)
 *   Right: MessageThread (grows) + Composer (bottom)
 *
 * Mobile: shadcn Sheet slide-over. The list view is always visible.
 * When a chat is selected, a Sheet slides in with the thread + composer.
 * A back button inside the Sheet returns to the list.
 *
 * localStorage persistence (Design Addendum):
 *   - Session selection → useLastSession
 *   - Chat selection    → useLastChat
 *   Fallback on mount (stored id not in current list):
 *     exactly 1 session → auto-select it
 *     0 sessions        → show CTA (caller renders emptyCta)
 *     2+ sessions       → leave picker unselected
 *
 * useChatStream is mounted at page level so non-active chats still
 * receive live updates (list timestamps, unread dots).
 *
 * Lint rules honoured:
 *   - react-hooks/set-state-in-effect: no setState inside useEffect bodies.
 *   - react-hooks/refs: no ref.current reads/writes during render.
 *   All state-from-data clearing happens during render via the pattern from
 *   cashier-session-page.tsx ("if stale id, clear during render").
 */

import { useCallback, useMemo, useState } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/features/auth/auth-context';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { toMillis } from './time';
import type { ChatScope } from '@/api/chat.service';
import type { ChatMessage } from '@/types/chat';
import {
  useChatList,
  useChatHistory,
  useChatStream,
  useSendMessage,
  useSendPhoto,
  useSendReaction,
  useLastSession,
  useLastChat,
} from './hooks';
import {
  SessionPicker,
  ChatList,
  MessageThread,
  Composer,
} from './components';
import type { SessionOption } from './components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatPageProps {
  scope: ChatScope;
  /** WORKING sessions to display in the session picker. */
  sessions: SessionOption[];
  /** Optional slot rendered above the session picker (admin cashier picker). */
  cashierPicker?: React.ReactNode;
  /** Optional CTA rendered when sessions.length === 0. */
  emptyCta?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the effective selected session id applying fallback logic.
 * If the stored id is not in the current sessions list:
 *   - exactly 1 session → auto-select it
 *   - 0 or 2+ → null (picker unselected / no sessions)
 */
function resolveSessionId(
  storedId: string | null,
  sessions: SessionOption[],
): string | null {
  if (storedId && sessions.some((s) => s.id === storedId)) {
    return storedId;
  }
  if (sessions.length === 1) {
    return sessions[0]!.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatPage = ({
  scope,
  sessions,
  cashierPicker,
  emptyCta,
}: ChatPageProps) => {
  const { token } = useAuth();
  const isMobile = useIsMobile();

  // ------------------------------------------------------------------
  // Session selection with localStorage persistence
  // ------------------------------------------------------------------

  const { lastSessionId, rememberSession } = useLastSession(scope);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    () => resolveSessionId(lastSessionId, sessions),
  );

  // If the selected session disappears (deleted / status changed), clear it.
  // Clear during render (not in an effect) — React batches this with the
  // current render and avoids the cascading re-render lint warning.
  const sessionStillExists =
    selectedSessionId === null ||
    sessions.some((s) => s.id === selectedSessionId);
  if (!sessionStillExists) {
    setSelectedSessionId(resolveSessionId(null, sessions));
  }

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setSelectedSessionId(sessionId);
      rememberSession(sessionId);
    },
    [rememberSession],
  );

  // ------------------------------------------------------------------
  // Chat selection with localStorage persistence
  // ------------------------------------------------------------------

  const { lastChatId, rememberChat } = useLastChat(scope, selectedSessionId);

  // selectedChatId is initialised from lastChatId. When the session changes,
  // the chat won't be in the new session's list and will be cleared by the
  // stale-id check below — no ref/effect needed.
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    lastChatId,
  );

  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  // Mobile sheet open state
  const [sheetOpen, setSheetOpen] = useState(false);

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const chatListQuery = useChatList(scope, selectedSessionId);

  // Stable reference — prevents exhaustive-deps warnings when chats is used
  // in conditional expressions during render.
  const chats = useMemo(
    () => chatListQuery.data ?? [],
    [chatListQuery.data],
  );

  // Auto-restore lastChatId once the chat list loads (render-time, no effect).
  // Condition: chatId is null, the list has loaded successfully, and the
  // stored chat is in the list.
  if (
    selectedChatId === null &&
    lastChatId !== null &&
    chatListQuery.isSuccess &&
    chats.some((c) => c.chatId === lastChatId)
  ) {
    setSelectedChatId(lastChatId);
  }

  // Clear stale selectedChatId during render.
  // When the session changes, chats will be empty or belong to the new session,
  // so a chat id from the old session will not be found and is cleared here.
  const chatStillExists =
    selectedChatId === null || chats.some((c) => c.chatId === selectedChatId);
  if (!chatStillExists) {
    setSelectedChatId(null);
    if (sheetOpen) setSheetOpen(false);
  }

  // ------------------------------------------------------------------
  // SSE stream — mounted at page level (all visible chats stay live).
  // Declared before handleSelectChat because the latter needs markChatRead.
  // ------------------------------------------------------------------

  const { unreadChatIds, markChatRead } = useChatStream(
    token,
    scope,
    selectedSessionId,
    selectedChatId,
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      setSelectedChatId(chatId);
      setReplyingTo(null);
      // Opening a chat clears its unread notification dot.
      markChatRead(chatId);
      // Desktop is a persistent two-pane layout (WhatsApp Web): selecting a
      // chat just swaps the right pane. The full-screen Sheet is mobile-only.
      if (isMobile) setSheetOpen(true);
      rememberChat(chatId);
    },
    [isMobile, markChatRead, rememberChat],
  );

  // ------------------------------------------------------------------
  // Message history
  // ------------------------------------------------------------------

  const historyQuery = useChatHistory(scope, selectedSessionId, selectedChatId);
  // WAHA returns history newest-first and the SSE stream prepends new messages,
  // so sort ascending by timestamp for WhatsApp-style display: oldest at the
  // top, newest at the bottom. (Pagination cursors read the raw pages, not this
  // derived list, so sorting here is display-only.)
  const messages = useMemo(() => {
    const flat = historyQuery.data?.pages.flat() ?? [];
    // De-dupe by message id: pagination boundaries and SSE/optimistic races can
    // surface the same message twice. Keep the first occurrence.
    const seen = new Set<string>();
    const unique = flat.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    return unique.sort((a, b) => toMillis(a.timestamp) - toMillis(b.timestamp));
  }, [historyQuery.data]);

  // ------------------------------------------------------------------
  // Send mutations (only meaningful when a chat + session are selected)
  // ------------------------------------------------------------------

  const activeSessionId = selectedSessionId ?? '';
  const activeChatId = selectedChatId ?? '';

  const sendMessage = useSendMessage(scope, activeSessionId, activeChatId);
  const sendPhoto = useSendPhoto(scope, activeSessionId, activeChatId);
  const sendReaction = useSendReaction(scope, activeSessionId, activeChatId);

  const handleSendText = useCallback(
    (text: string, replyTo?: string) => {
      sendMessage.mutate({ text, replyTo });
      setReplyingTo(null);
    },
    [sendMessage],
  );

  const handleSendPhoto = useCallback(
    (file: File, caption?: string) => {
      sendPhoto.mutate({ file, caption });
    },
    [sendPhoto],
  );

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      sendReaction.mutate({ messageId, reaction: emoji });
    },
    [sendReaction],
  );

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------

  const isSending = sendMessage.isPending || sendPhoto.isPending;
  const hasOlder = historyQuery.hasNextPage ?? false;

  const handleLoadOlder = useCallback(() => {
    void historyQuery.fetchNextPage();
  }, [historyQuery]);

  const selectedChatName =
    chats.find((c) => c.chatId === selectedChatId)?.displayName ?? 'Chat';

  // ------------------------------------------------------------------
  // Panels
  // ------------------------------------------------------------------

  const listPanel = (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {cashierPicker}
      {sessions.length === 0 ? (
        (emptyCta ?? null)
      ) : (
        <>
          <SessionPicker
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelect={handleSelectSession}
          />
          <ChatList
            chats={chats}
            selectedChatId={selectedChatId}
            onSelect={handleSelectChat}
            unreadChatIds={unreadChatIds}
            isLoading={chatListQuery.isLoading}
          />
        </>
      )}
    </div>
  );

  const threadPanel =
    selectedChatId && selectedSessionId ? (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* key on chatId → full remount per conversation, so no scroll
              position or message state can bleed across chats. */}
          <MessageThread
            key={selectedChatId}
            messages={messages}
            scope={scope}
            sessionId={selectedSessionId}
            chatId={selectedChatId}
            isLoading={historyQuery.isLoading}
            hasOlder={hasOlder}
            onLoadOlder={handleLoadOlder}
            onReply={setReplyingTo}
            onReact={handleReact}
          />
        </div>
        <div className="shrink-0 border-t">
          <Composer
            onSendText={handleSendText}
            onSendPhoto={handleSendPhoto}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            sending={isSending}
          />
        </div>
      </div>
    ) : (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Seleccioná un chat para ver los mensajes
      </div>
    );

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------

  return (
    <div className="flex h-[calc(100svh-8rem)] overflow-hidden rounded-2xl border bg-card shadow-sm md:h-[calc(100svh-6rem)]">
      {/* Desktop: left column — list */}
      <div className="hidden w-72 shrink-0 flex-col border-r md:flex">
        {listPanel}
      </div>

      {/* Desktop: right column — thread */}
      <div className="hidden flex-1 flex-col overflow-hidden md:flex">
        {threadPanel}
      </div>

      {/* Mobile: full-width list */}
      <div className="flex flex-1 flex-col overflow-hidden md:hidden">
        {listPanel}
      </div>

      {/* Mobile: Sheet slide-over for the thread. Never opens on desktop —
          there the right pane already shows the conversation. */}
      <Sheet open={isMobile && sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          showCloseButton={false}
          className="flex w-full flex-col gap-0 p-0 sm:max-w-full"
        >
          <SheetTitle className="sr-only">{selectedChatName}</SheetTitle>
          {/* Back navigation header */}
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Volver a la lista"
              onClick={() => setSheetOpen(false)}
            >
              <ArrowLeftIcon className="size-4" />
            </Button>
            <span className="truncate text-sm font-medium">
              {selectedChatName}
            </span>
          </div>
          {/* Thread + Composer */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {threadPanel}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
