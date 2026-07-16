import { generateSecretKey, getPublicKey, nip44 } from 'nostr-tools';
import type { NPool, NostrEvent } from '@nostrify/nostrify';

export interface NostrConnectSession {
  uri: string;
  clientPubkey: string;
  relay: string;
  secret: string;
}

function randomSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const PERMS = [
  'sign_event:0',
  'sign_event:1',
  'sign_event:13',
  'sign_event:1059',
  'sign_event:30402',
  'nip44_encrypt',
  'nip44_decrypt',
].join(',');

/** Creates a new client-initiated NIP-46 ("nostrconnect://") pairing session. */
export function createNostrConnectSession(relay: string, appName: string): {
  session: NostrConnectSession;
  clientSecretKey: Uint8Array;
} {
  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);
  const secret = randomSecret();

  const params = new URLSearchParams();
  params.set('relay', relay);
  params.set('secret', secret);
  params.set('name', appName);
  params.set('perms', PERMS);

  const uri = `nostrconnect://${clientPubkey}?${params.toString()}`;

  return { session: { uri, clientPubkey, relay, secret }, clientSecretKey };
}

/**
 * Waits for the remote signer (e.g. Amber) to respond to a nostrconnect:// session
 * with the expected `ack` secret, and returns the remote signer's pubkey.
 */
export async function waitForNostrConnectAck(
  nostr: NPool,
  clientSecretKey: Uint8Array,
  session: NostrConnectSession,
  signal: AbortSignal,
): Promise<string> {
  const pool = nostr.group([session.relay]);
  const since = Math.floor(Date.now() / 1000) - 10;

  for await (const msg of pool.req([{ kinds: [24133], '#p': [session.clientPubkey], since }], { signal })) {
    if (msg[0] !== 'EVENT') continue;
    const event = msg[2] as NostrEvent;

    try {
      const conversationKey = nip44.getConversationKey(clientSecretKey, event.pubkey);
      const plaintext = nip44.decrypt(event.content, conversationKey);
      const data = JSON.parse(plaintext);
      if (data.result === session.secret) {
        return event.pubkey;
      }
    } catch {
      // Not decryptable with our key, or not the ack we're waiting for — ignore.
    }
  }

  throw new Error('Timed out waiting for the signer to connect');
}
