import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

interface NotificationsContextValue {
  permission: Permission;
  request: () => Promise<Permission>;
  showBrowser: (opts: { title: string; body?: string; icon?: string; tag?: string; onClick?: () => void }) => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  permission: 'default',
  request: async () => 'default',
  showBrowser: () => {}
});

function detectPermission(): Permission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as Permission;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [permission, setPermission] = useState<Permission>(detectPermission());

  useEffect(() => {
    // re-check on mount (covers Strict-Mode replay & cross-tab changes)
    setPermission(detectPermission());
  }, []);

  const request = useCallback(async (): Promise<Permission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      setPermission(Notification.permission as Permission);
      return Notification.permission as Permission;
    }
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
    return result as Permission;
  }, []);

  const showBrowser = useCallback(({ title, body, icon, tag, onClick }: {
    title: string; body?: string; icon?: string; tag?: string; onClick?: () => void;
  }) => {
    if (permission !== 'granted') return;
    // Only show OS-level notifications when the tab is not focused.
    // When the tab IS focused, the in-app toast handles UX.
    if (typeof document !== 'undefined' && !document.hidden) return;

    try {
      const n = new Notification(title, { body, icon, tag });
      n.onclick = () => {
        window.focus();
        onClick?.();
        n.close();
      };
      // Auto-close after 6 seconds (some OSes keep them too long)
      setTimeout(() => n.close(), 6000);
    } catch {
      // ignore — some browsers throw if quota is reached
    }
  }, [permission]);

  return (
    <NotificationsContext.Provider value={{ permission, request, showBrowser }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
