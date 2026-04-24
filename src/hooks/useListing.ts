import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';

export function useListing(d: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<NostrEvent | null>({
    queryKey: ['nip99-listing', user?.pubkey ?? '', d ?? ''],
    enabled: !!user?.pubkey && !!d,
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [30402], authors: [user!.pubkey], '#d': [d!], limit: 10 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      if (!events.length) return null;
      return events.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
    },
  });
}
