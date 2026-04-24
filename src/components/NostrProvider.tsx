import React, { useEffect, useRef } from 'react';
import { NostrEvent, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
interface NostrProviderProps {
  children: React.ReactNode;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();

  const queryClient = useQueryClient();

  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Use refs so the pool always has the latest data
  const relayUrls = useRef<string[]>(config.relayUrls);

  // Update refs when config changes
  useEffect(() => {
    relayUrls.current = config.relayUrls;
    queryClient.resetQueries();
  }, [config.relayUrls, queryClient]);

  // Initialize NPool only once
  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url);
      },
      reqRouter(filters) {
        const router = new Map<string, typeof filters>();
        for (const url of relayUrls.current.filter(Boolean)) {
          router.set(url, filters);
        }
        return router;
      },
      eventRouter(_event: NostrEvent) {
        return relayUrls.current.filter(Boolean);
      },
    });
  }

  return (
    <NostrContext.Provider value={{ nostr: pool.current }}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;