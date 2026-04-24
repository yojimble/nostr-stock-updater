import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';

export function useUserListings() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<NostrEvent[]>({
    queryKey: ['nip99-listings', user?.pubkey ?? ''],
    enabled: !!user?.pubkey,
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [30402], authors: [user!.pubkey], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );

      // Relays should already dedupe parameterized replaceable events by d-tag,
      // but query across multiple relays can return stale copies — keep latest per d.
      const latest = new Map<string, NostrEvent>();
      for (const ev of events) {
        const d = ev.tags.find(([t]) => t === 'd')?.[1];
        if (d === undefined) continue;
        const existing = latest.get(d);
        if (!existing || ev.created_at > existing.created_at) {
          latest.set(d, ev);
        }
      }

      return [...latest.values()].sort((a, b) => b.created_at - a.created_at);
    },
  });
}
