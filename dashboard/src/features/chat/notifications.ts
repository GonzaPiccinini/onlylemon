/**
 * notifications.ts — In-app browser notifications for incoming chats (Option A).
 *
 * Uses the Web Notifications API directly from the page. A notification is an
 * OS-level toast (rendered by the browser, not the DOM), so it surfaces even
 * when the dashboard tab is backgrounded — as long as the tab is still alive
 * and the user granted permission. It does NOT work with the tab/browser
 * closed; that requires Web Push + a Service Worker (Option B, future work).
 *
 * Mobile note: some browsers (e.g. Android Chrome) forbid the `new Notification`
 * constructor and require ServiceWorkerRegistration.showNotification instead —
 * there `showChatNotification` simply no-ops (wrapped in try/catch).
 */

export type NotificationPermissionState =
  | 'default'
  | 'granted'
  | 'denied'
  | 'unsupported';

/** Current permission, or 'unsupported' when the API is unavailable. */
export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/** Prompts the user for permission. Must be called from a user gesture. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

interface ShowChatNotificationArgs {
  title: string;
  body: string;
  /** Collapses repeated notifications from the same chat into one. */
  tag?: string;
  /** Extra action on click (window focus is always applied). */
  onClick?: () => void;
}

/**
 * Shows an OS notification for a chat message. No-ops when the API is
 * unavailable or permission was not granted, so callers don't need to guard.
 */
export function showChatNotification({
  title,
  body,
  tag,
  onClick,
}: ShowChatNotificationArgs): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body,
      tag,
      icon: '/logo_sin_nombre.png',
    });
    notification.onclick = (event) => {
      event.preventDefault();
      window.focus();
      onClick?.();
      notification.close();
    };
  } catch {
    // Constructor unsupported (e.g. Android Chrome) — silently ignore.
  }
}
