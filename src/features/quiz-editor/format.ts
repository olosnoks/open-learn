/** "Just now", "5 min ago", "3 h ago", "2 days ago", then a plain date. */
export function formatUpdated(updatedAt: number, now = Date.now()): string {
  const diff = Math.max(0, now - updatedAt);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(updatedAt).toLocaleDateString();
}
