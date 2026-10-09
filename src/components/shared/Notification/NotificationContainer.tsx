'use client';

import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { CustomNotificationToast } from './CustomNotificationToast';
import { NotificationItem } from './types';

interface NotificationContainerProps {
  items: NotificationItem[];
  onClose: (id: string) => void;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({
  items,
  onClose
}) => {
  // false on the server and during hydration, true afterwards, so the portal only renders in the browser.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <aside
      aria-label="Notifications"
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: 'calc(100vw - 40px)',
        maxWidth: 440,
        pointerEvents: 'none'
      }}
    >
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <CustomNotificationToast key={item.id} item={item} onClose={onClose} />
        ))}
      </AnimatePresence>
    </aside>,
    document.body
  );
};
