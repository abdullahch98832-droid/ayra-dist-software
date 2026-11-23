/** Text is built on the client from the dictionary so it follows the current language. */
export interface AppNotification {
  id: string;
  kind: "usersWithoutRole";
  count: number;
  href: string;
}

export type NotificationResult = { ok: true; items: AppNotification[] } | { ok: false };
