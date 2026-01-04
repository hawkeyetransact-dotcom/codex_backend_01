export type NotificationEventCategory = keyof typeof NotificationEvent;
export type NotificationEventKey = (typeof NotificationEventFlat)[number];
export { NotificationEvent, NotificationEventFlat } from './NotificationEvent.js';
