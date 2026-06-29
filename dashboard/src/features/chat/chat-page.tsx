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
import { resolveContactTitle } from './contact';
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

  // Auto-select once sessions arrive after mount. The useState initializer above
  // runs only on the first render; in the admin flow ChatPage mounts before the
  // cashier's sessions have loaded (initial list is empty), so the single-session
  // default never fired and the chats wouldn't load. Re-resolve while nothing is
  // selected yet — a no-op when a session is already chosen or the list is empty.
  if (selectedSessionId === null) {
    const autoSelected = resolveSessionId(lastSessionId, sessions);
    if (autoSelected !== null) {
      setSelectedSessionId(autoSelected);
    }
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

  // Contact's display name (saved name → phone fallback) for labelling quoted
  // replies — both in the thread and in the composer's reply preview.
  const contactName = selectedChat
    ? resolveContactTitle(selectedChat).title
    : undefined;

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
    <div className="flex h-full min-h-0 flex-col">
      {/* Pinned header — cashier/session pickers + status action stay fixed
          at the top while the contacts list scrolls below them. */}
      <div className="flex shrink-0 flex-col gap-2 py-3 md:pt-0">
        {/* Admin cashier back — its own floating glass-subtle chip. */}
        {cashierPicker}

        {/* Session picker — its own floating glass-subtle chip. */}
        {sessions.length > 0 && (
          <SessionPicker
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelect={handleSelectSession}
          />
        )}

        {/* Secondary actions — icon-only, right-aligned, airy. */}
        <div className="flex items-center justify-end gap-0.5">
          {sessions.length > 0 && selectedSessionId && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setStatusDialogOpen(true)}
              title="Publicar estado"
              aria-label="Publicar estado"
              className="text-muted-foreground hover:text-foreground"
            >
              <CircleFadingPlusIcon className="size-4" />
            </Button>
          )}
          <NotificationToggle />
        </div>
      </div>

      {/* Scrollable contacts region — its own floating glass card, edge-aligned
          with the page header / mobile nav above. Grows with chat count and
          scrolls in place, so the list never overflows the (viewport-locked)
          layout. */}
      <div className="min-h-0 flex-1">
        <div className="scrollbar-thin glass flex h-full min-h-0 flex-col overflow-y-auto rounded-2xl">
          {sessions.length === 0 ? (
            <div className="p-3">{emptyCta ?? null}</div>
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
    </div>
  );

  // Right-pane empty state when no chat is open. Three distinct situations,
  // so the copy never contradicts the list on the left:
  //   - no session selected      → "Elegí una sesión"
  //   - session has zero chats    → "No hay chats todavía" (don't say "pick a
  //     chat" when the list is empty — mirrors ChatList's own empty copy)
  //   - session has chats, none picked → "Elegí un chat"
  // The `!isLoading` guard keeps us on "Elegí un chat" during the first load
  // (cache miss) so we never claim "no chats" before the query has settled.
  const threadEmpty = !selectedSessionId
    ? {
        icon: SmartphoneIcon,
        title: 'Elegí una sesión',
        description: 'Seleccioná un número de WhatsApp para ver sus chats.',
      }
    : chats.length === 0 && !chatListQuery.isLoading
      ? {
          icon: MessagesSquareIcon,
          title: 'No hay chats todavía',
          description: 'Cuando llegue un mensaje a este número, vas a verlo acá.',
        }
      : {
          icon: MessagesSquareIcon,
          title: 'Elegí un chat',
          description:
            'Abrí una conversación de la izquierda para ver el historial y responder.',
        };

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
            contactName={contactName}
          />
        </div>
        <div className="shrink-0">
          <Composer
            onSendText={handleSendText}
            onSendPhoto={handleSendPhoto}
            onTyping={onTyping}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            contactName={contactName}
            sending={isSending}
          />
        </div>
      </div>
    ) : (
      <ChatEmptyState
        icon={threadEmpty.icon}
        title={threadEmpty.title}
        description={threadEmpty.description}
      />
    );

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------

  return (
    <div className="relative flex min-h-0 flex-1 gap-3 overflow-hidden">
      {/* Desktop: left column — no column bg; each control + the list float in
          their own glass surface. */}
      <div className="hidden w-80 shrink-0 flex-col md:flex">
        {listPanel}
      </div>

      {/* Desktop: right column — thread (floating glass card) */}
      <div className="hidden flex-1 flex-col overflow-hidden rounded-2xl glass md:flex">
        {threadPanel}
      </div>

      {/* Mobile: full-width list — same floating-glass treatment as desktop. */}
      <div className="flex flex-1 flex-col md:hidden">
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
        aria-modal={isMobile && sheetOpen}
        className={[
          'absolute inset-0 z-50 flex flex-col overflow-hidden rounded-2xl glass transition-transform duration-200 md:hidden',
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
