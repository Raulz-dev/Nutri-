export function mergeMessages<T extends { id: string; sent_at: string }>(
  current: T[],
  incoming: T[],
): T[] {
  return [
    ...new Map(
      [...current, ...incoming].map((message) => [message.id, message]),
    ).values(),
  ].sort(
    (a, b) => a.sent_at.localeCompare(b.sent_at) || a.id.localeCompare(b.id),
  );
}
