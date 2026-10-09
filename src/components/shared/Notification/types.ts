import { ReactNode } from 'react';

export type NotificationSeverity = 'success' | 'error' | 'warning' | 'info';

export interface NotificationAction {
  label: string;
  onClick: (id: string) => void;
  variant?: 'solid' | 'outline' | 'text';
}

export interface NotificationItem {
  id: string;
  title?: string;
  message: ReactNode;
  severity: NotificationSeverity;
  duration?: number; // in milliseconds (default: 4500ms). If 0, persistent until dismissed.
  action?: NotificationAction;
  details?: string | ReactNode;
  createdAt: number;
}

export interface ShowNotificationInput {
  title?: string;
  message: ReactNode;
  severity?: NotificationSeverity;
  duration?: number;
  action?: NotificationAction;
  details?: string | ReactNode;
  id?: string;
}
