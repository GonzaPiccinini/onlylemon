/**
 * group-sender.ts
 *
 * Resolves the display name of a GROUP message's sender — the name WhatsApp shows
 * above each incoming message in a group chat. Shared by both message paths:
 *   - history  (chat.repository ← WAHA GET messages)
 *   - realtime (processor ← WAHA webhook payload)
 * so both render the same sender label.
 *
 * Returns null when it does not apply:
 *   - the chat is not a group, or
 *   - the message is outbound (fromMe).
 *
 * Source of truth (WAHA GOWS 2026.3.4, confirmed against live data):
 *   `_data.Info.PushName`  → sender display name (preferred)
 *   `_data.Info.SenderAlt` → sender phone JID (e.g. "549...:26@s.whatsapp.net"),
 *                            used to build a "+<phone>" fallback
 *   `_data.Info.IsGroup`   → group flag (we also accept a `@g.us` from-suffix)
 */

type WahaInfo = {
  PushName?: unknown;
  SenderAlt?: unknown;
  IsGroup?: unknown;
};

export function extractGroupSenderName(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw) return null;

  const info = ((raw._data as { Info?: WahaInfo } | undefined)?.Info) ?? undefined;
  const from = typeof raw.from === 'string' ? raw.from : '';
  const isGroup = info?.IsGroup === true || from.endsWith('@g.us');
  if (!isGroup) return null;
  if (raw.fromMe === true) return null;

  const pushName = info?.PushName;
  if (typeof pushName === 'string' && pushName.trim()) {
    return pushName.trim();
  }

  // Fallback: derive "+<phone>" from SenderAlt (the real phone JID), e.g.
  // "5493516835986:26@s.whatsapp.net" → "+5493516835986". The top-level
  // `participant` is a @lid id (not a phone), so it is not used here.
  const senderAlt = info?.SenderAlt;
  const phone =
    typeof senderAlt === 'string' ? senderAlt.split('@')[0]?.split(':')[0] : undefined;
  if (phone && /^\d+$/.test(phone)) {
    return `+${phone}`;
  }

  return null;
}
