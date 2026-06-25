/**
 * contact.ts — Resolves the title shown for a chat counterpart.
 *
 * A chat shows the saved contact name when the contact is in the address book
 * (`displayName` present and not a bare number). When the contact is NOT saved
 * — `displayName` is null, empty, or just digits — we fall back to the phone
 * number derived from the chatId (`<number>@c.us`), prefixed with "+".
 *
 * Shared by ChatList (rows) and ChatHeader (conversation top bar) so both
 * render an identical title for the same chat.
 */

import type { ChatListEntry } from '@/types/chat';

/**
 * Resolves the title for a chat.
 *
 * @returns `title` — the saved contact name, or the phone number (`+digits`)
 *   when the contact is not saved. `isPhone` flags when the title is a bare
 *   number so callers can fall back to an icon instead of a name initial.
 */
export function resolveContactTitle(chat: ChatListEntry): {
  title: string;
  isPhone: boolean;
} {
  const name = chat.displayName?.trim();
  const local = chat.chatId.split('@')[0] ?? '';

  // A real saved name (not just the bare number) → use it.
  if (name && !/^\d+$/.test(name)) {
    return { title: name, isPhone: false };
  }

  // No name (or the "name" is just digits) → show the phone number.
  const digits = name && /^\d+$/.test(name) ? name : local;
  const title = /^\d+$/.test(digits) ? `+${digits}` : digits;
  return { title, isPhone: true };
}

/**
 * Resolves the contact's phone number (`+digits`) from the chatId, or null when
 * the chat has no real phone number — i.e. groups (`@g.us`) and linked-device
 * ids (`@lid`), whose local part is an internal id rather than a phone.
 *
 * Used by ChatHeader to show the number under a saved contact's name.
 */
export function resolveContactPhone(chat: ChatListEntry): string | null {
  const [local, domain] = chat.chatId.split('@');
  if (domain !== 'c.us') return null;
  if (!local || !/^\d+$/.test(local)) return null;
  return `+${local}`;
}
