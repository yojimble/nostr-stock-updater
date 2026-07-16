import { nip19, nip05, getEventHash, generateSecretKey, finalizeEvent } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import type { NUser } from '@nostrify/react/login';
import { nip44 } from 'nostr-tools';

/** Resolves an npub/nprofile/NIP-05 identifier to a hex pubkey. */
export async function resolveRecipientPubkey(input: string): Promise<string> {
  const value = input.trim();

  if (/^npub1[0-9a-z]+$/.test(value)) {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'npub') throw new Error('Not an npub');
    return decoded.data;
  }

  if (/^nprofile1[0-9a-z]+$/.test(value)) {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'nprofile') throw new Error('Not an nprofile');
    return decoded.data.pubkey;
  }

  if (nip05.isNip05(value)) {
    const profile = await nip05.queryProfile(value);
    if (!profile) throw new Error('Could not resolve NIP-05 address');
    return profile.pubkey;
  }

  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();

  throw new Error('Enter a valid npub, nprofile, or NIP-05 address (name@domain.com)');
}

interface Rumor {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

function randomizedTimestamp(): number {
  // NIP-17: randomize up to 2 days in the past to reduce metadata leakage.
  return Math.floor(Date.now() / 1000 - Math.random() * 2 * 24 * 60 * 60);
}

async function giftWrap(recipientPubkey: string, seal: NostrEvent): Promise<NostrEvent> {
  const ephemeralSecret = generateSecretKey();
  const conversationKey = nip44.getConversationKey(ephemeralSecret, recipientPubkey);
  const content = nip44.encrypt(JSON.stringify(seal), conversationKey);

  return finalizeEvent(
    {
      kind: 1059,
      content,
      tags: [['p', recipientPubkey]],
      created_at: randomizedTimestamp(),
    },
    ephemeralSecret,
  ) as unknown as NostrEvent;
}

/**
 * Sends a NIP-17 private direct message (seal + gift wrap) from `user` to `recipientPubkey`,
 * and a second gift-wrapped copy to the sender so they retain their own receipt.
 */
export async function sendReceiptDm(
  user: NUser,
  recipientPubkey: string,
  content: string,
  nostr: { event: (e: NostrEvent, opts?: { signal?: AbortSignal }) => Promise<void> },
): Promise<void> {
  if (!user.signer.nip44) {
    throw new Error('Your signer does not support NIP-44 encryption, required to send receipts.');
  }

  const rumor: Rumor = {
    pubkey: user.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 14,
    tags: [['p', recipientPubkey]],
    content,
    id: '',
  };
  rumor.id = getEventHash(rumor);

  const sealFor = async (targetPubkey: string) => {
    const encryptedRumor = await user.signer.nip44!.encrypt(targetPubkey, JSON.stringify(rumor));
    return user.signer.signEvent({
      kind: 13,
      content: encryptedRumor,
      tags: [],
      created_at: randomizedTimestamp(),
    });
  };

  const recipientSeal = await sealFor(recipientPubkey);
  const recipientWrap = await giftWrap(recipientPubkey, recipientSeal);

  const selfSeal = await sealFor(user.pubkey);
  const selfWrap = await giftWrap(user.pubkey, selfSeal);

  const signal = AbortSignal.timeout(8000);
  await Promise.all([
    nostr.event(recipientWrap, { signal }),
    nostr.event(selfWrap, { signal }),
  ]);
}

export function formatReceipt(opts: {
  sellerName?: string;
  lines: { title: string; qty: number; price: number; currency: string }[];
  totalSats: number;
  memo?: string;
}): string {
  const { sellerName, lines, totalSats, memo } = opts;
  const parts: string[] = [];
  parts.push(`Receipt${sellerName ? ` from ${sellerName}` : ''}`);
  parts.push('');
  if (lines.length > 0) {
    for (const line of lines) {
      parts.push(`${line.qty}x ${line.title} — ${line.price} ${line.currency}`);
    }
    parts.push('');
  }
  if (memo) {
    parts.push(memo);
    parts.push('');
  }
  parts.push(`Total paid: ${totalSats.toLocaleString()} sats`);
  return parts.join('\n');
}
