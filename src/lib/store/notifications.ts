"use client";

/**
 * The workspace's notification feed.
 *
 * Timestamps are absolute instants from the database, formatted relative to the
 * reader at display time — the previous version stored phrases like "2 min ago",
 * which stopped being true a minute after they were written.
 */
export { useNotifications, type NotificationsState } from "./workspace-stores";
