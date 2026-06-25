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
 * Mobile: the list view is always visible. When a chat is selected, a
 * full-screen conversation overlay slides in from the right (WhatsApp-style)
 * with the thread + composer. The back button in ChatHeader returns to the list.
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
import { CircleFadingPlusIcon, MessagesSquareIcon, SmartphoneIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { toMillis } from './time';
import { chatService, type ChatScope } from '@/api/chat.service';
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
  rememberChatFor,
  useTypingPresence,
} from './hooks';
import {
  SessionPicker,
  ChatList,
  MessageThread,
  ChatHeader,
  ChatEmptyState,
  Composer,
  StatusComposerDialog,
  NotificationToggle,
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

  // Status composer dialog open state
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const chatListQuery = useChatList(scope, selectedSessionId);

  // Flatten the infinite-query pages into a single list, de-duping by chatId
  // (offset pagination over live-updating data can surface a chat twice across
  // a page boundary when ordering shifts). Stable reference for exhaustive-deps.
  const chats = useMemo(() => {
    const flat = chatListQuery.data?.pages.flat() ?? [];
    const seen = new Set<string>();
    return flat.filter((c) => {
      if (seen.has(c.chatId)) return false;
      seen.add(c.chatId);
      return true;
    });
  }, [chatListQuery.data]);

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

  // Navigate to a specific chat (used by notification clicks). Switches the
  // session if needed and opens the chat. The target chat is persisted for its
  // session first, so when the (possibly different) session's list loads the
  // page's auto-restore opens it even before the optimistic id resolves.
  const handleNavigateToChat = useCallback(
    (sessionId: string, chatId: string) => {
      rememberChatFor(scope, sessionId, chatId);
      rememberSession(sessionId);
      setSelectedSessionId(sessionId);
      setSelectedChatId(chatId);
      setReplyingTo(null);
      // Mark as read on WhatsApp when opening via a notification. Best-effort.
      void chatService.markSeen(scope, sessionId, chatId).catch(() => {});
      if (isMobile) setSheetOpen(true);
    },
    [scope, rememberSession, isMobile],
  );

  // ------------------------------------------------------------------
  // SSE stream — mounted at page level (all visible chats stay live).
  // Declared before handleSelectChat because the latter needs markChatRead.
  // ------------------------------------------------------------------

  const { unreadChatIds, markChatRead } = useChatStream(
    token,
    scope,
    selectedSessionId,
    selectedChatId,
    handleNavigateToChat,
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      setSelectedChatId(chatId);
      setReplyingTo(null);
      // Opening a chat clears its unread notification dot.
      markChatRead(chatId);
      // Mark the chat's messages as read on WhatsApp (blue ticks). Best-effort.
      if (selectedSessionId) {
        void chatService.markSeen(scope, selectedSessionId, chatId).catch(() => {});
      }
      // Desktop is a persistent two-pane layout (WhatsApp Web): selecting a
      // chat just swaps the right pane. The full-screen Sheet is mobile-only.
      if (isMobile) setSheetOpen(true);
      rememberChat(chatId);
    },
    [isMobile, markChatRead, rememberChat, scope, selectedSessionId],
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

  // Real-time "escribiendo…" presence — driven by composer keystrokes.
  const { onType: onTyping, stop: stopTyping } = useTypingPresence(
    scope,
    activeSessionId,
    activeChatId,
  );

  const handleSendText = useCallback(
    (text: string, replyTo?: string) => {
      stopTyping();
      sendMessage.mutate({ text, replyTo });
      setReplyingTo(null);
    },
    [sendMessage, stopTyping],
  );

  const handleSendPhoto = useCallback(
    (file: File, caption?: string) => {
      stopTyping();
      sendPhoto.mutate({ file, caption });
    },
    [sendPhoto, stopTyping],
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

  // The selected chat entry — falls back to a minimal entry built from the id
  // so the header still shows the phone number before the list has loaded.
  const selectedChat =
    chats.find((c) => c.chatId === selectedChatId) ??
    (selectedChatId
      ? { chatId: selectedChatId, displayName: null, lastMessageTimestamp: 0 }
      : undefined);

  const selectedChatName = selectedChat?.displayName ?? 'Chat';

  // Session label (alias → +phone → code) — shown in the ChatHeader ONLY on
  // mobile, where the session picker is hidden behind the conversation overlay.
  // On desktop the picker is always visible on the left, so it's omitted there.
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const selectedSessionLabel = selectedSession
    ? (selectedSession.alias?.trim() ||
        (selectedSession.whatsappPhoneNumber
          ? `+${selectedSession.whatsappPhoneNumber}`
          : selectedSession.sessionName))
    : undefined;

  // ------------------------------------------------------------------
  // Panels
  // ------------------------------------------------------------------

  const listPanel = (
    <div className="flex h-full min-h-0 flex-col bg-black">
      {/* Pinned header — cashier/session pickers + status action stay fixed
          at the top while the contacts list scrolls below them. */}
      <div className="flex shrink-0 flex-col gap-3 px-3 pt-3">
        <NotificationToggle />
        {cashierPicker}
        {sessions.length > 0 && (
          <SessionPicker
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelect={handleSelectSession}
          />
        )}
        {sessions.length > 0 && selectedSessionId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStatusDialogOpen(true)}
            className="shrink-0 justify-start gap-2"
          >
            <CircleFadingPlusIcon className="size-4" />
            Publicar estado
          </Button>
        )}
      </div>

      {/* Scrollable contacts region — grows with chat count and scrolls in
          place, so the list never overflows the (viewport-locked) layout. */}
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        {sessions.length === 0 ? (
          (emptyCta ?? null)
        ) : (
          <ChatList
            chats={chats}
            selectedChatId={selectedChatId}
            onSelect={handleSelectChat}
            unreadChatIds={unreadChatIds}
            isLoading={chatListQuery.isLoading}
            hasMore={chatListQuery.hasNextPage}
            onLoadMore={() => void chatListQuery.fetchNextPage()}
            isLoadingMore={chatListQuery.isFetchingNextPage}
          />
        )}
      </div>
    </div>
  );

  const threadPanel =
    selectedChatId && selectedSessionId ? (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Top bar with the other party's name (or phone if not saved). */}
        {selectedChat && (
          <ChatHeader
            chat={selectedChat}
            onBack={isMobile ? () => setSheetOpen(false) : undefined}
            sessionLabel={isMobile ? selectedSessionLabel : undefined}
          />
        )}
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
            onTyping={onTyping}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            sending={isSending}
          />
        </div>
      </div>
    ) : (
      <ChatEmptyState
        icon={selectedSessionId ? MessagesSquareIcon : SmartphoneIcon}
        title={selectedSessionId ? 'Elegí un chat' : 'Elegí una sesión'}
        description={
          selectedSessionId
            ? 'Abrí una conversación de la izquierda para ver el historial y responder.'
            : 'Seleccioná un número de WhatsApp para ver sus chats.'
        }
      />
    );

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border bg-black shadow-sm">
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

      {/* Mobile: full-screen conversation overlay that slides in from the
          right when a chat is selected (WhatsApp-style). Hidden on desktop —
          there the right pane already shows the conversation. ChatHeader
          (inside threadPanel) carries the back button + contact info. */}
      <div
        role="dialog"
        aria-label={selectedChatName}
        aria-hidden={!(isMobile && sheetOpen)}
        className={[
          'absolute inset-0 z-50 flex flex-col bg-black transition-transform duration-200 md:hidden',
          isMobile && sheetOpen
            ? 'translate-x-0'
            : 'pointer-events-none translate-x-full',
        ].join(' ')}
      >
        {threadPanel}
      </div>

      {/* Status composer — needs a selected session to publish against */}
      {selectedSessionId && (
        <StatusComposerDialog
          open={statusDialogOpen}
          onOpenChange={setStatusDialogOpen}
          scope={scope}
          sessionId={selectedSessionId}
        />
      )}
    </div>
  );
};
