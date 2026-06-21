import { useCallback, useState } from 'react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '../notifications';

/**
 * Tracks the browser Notification permission and exposes an `enable()` action
 * that prompts the user (must run from a click handler). Permission only
 * changes through `enable()` or the browser settings, so no subscription is
 * needed — state is seeded once and updated on request.
 */
export const useNotificationPermission = () => {
  const [permission, setPermission] = useState<NotificationPermissionState>(
    () => getNotificationPermission(),
  );

  const enable = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    return result;
  }, []);

  return { permission, enable };
};
