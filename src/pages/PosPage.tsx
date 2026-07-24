import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImageOff, AlertCircle, Minus, Plus, Trash2, Zap, RefreshCw, LayoutGrid, List, Search, X } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { LoginArea } from '@/components/auth/LoginArea';
import { NavTabs } from '@/components/NavTabs';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserListings } from '@/hooks/useUserListings';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useBtcPrice, toSats } from '@/hooks/useBtcPrice';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { PaymentDialog } from '@/components/pos/PaymentDialog';

type ViewMode = 'image' | 'list';

type SortMode =
  | 'newest'
  | 'oldest'
  | 'name-asc'
  | 'name-desc'
  | 'price-asc'
  | 'price-desc'
  | 'stock-asc'
  | 'stock-desc';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'price-asc', label: 'Price (low–high)' },
  { value: 'price-desc', label: 'Price (high–low)' },
  { value: 'stock-asc', label: 'Stock (low–high)' },
  { value: 'stock-desc', label: 'Stock (high–low)' },
];

function tagValue(tags: string[][], name: string): string | undefined {
  return tags.find(([t]) => t === name)?.[1];
}

function hasStockTag(ev: NostrEvent): boolean {
  return ev.tags.some(([t]) => t === 'stock' || t === 'quantity');
}

function currentQty(ev: NostrEvent): number {
  const q = tagValue(ev.tags, 'stock') ?? tagValue(ev.tags, 'quantity');
  const n = q !== undefined ? parseInt(q, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Replaces the stock/quantity tag in place rather than removing it and
 * appending a new one at the end — that reorders every tag after it, which
 * makes some signer permission UIs show a confusing positional diff (e.g.
 * reporting the tag that slid into stock's old slot as if it changed).
 */
function withUpdatedStock(tags: string[][], newQty: number): string[][] {
  const stockTag = ['stock', String(newQty)];
  let replaced = false;
  const next = tags.reduce<string[][]>((acc, tag) => {
    if (tag[0] === 'stock' || tag[0] === 'quantity') {
      if (!replaced) {
        acc.push(stockTag);
        replaced = true;
      }
      return acc;
    }
    acc.push(tag);
    return acc;
  }, []);
  if (!replaced) next.push(stockTag);
  return next;
}

interface CartLine {
  d: string;
  title: string;
  qty: number;
  price: number;
  currency: string;
  managed: boolean;
  stock: number;
  /** The exact listing event as it was when added to the cart, used to publish the stock update at checkout. */
  sourceEvent: NostrEvent;
}

export default function PosPage() {
  const { user, metadata } = useCurrentUser();
  const { data: listings, isLoading, isError, refetch } = useUserListings();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { data: btcPrices } = useBtcPrice();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [receiptSnapshot, setReceiptSnapshot] = useState<CartLine[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [charging, setCharging] = useState(false);
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('nostr:pos-view-mode', 'image');
  const [sortMode, setSortMode] = useLocalStorage<SortMode>('nostr:pos-sort-mode', 'newest');
  const [search, setSearch] = useState('');
  const [memo, setMemo] = useState('');

  useSeoMeta({
    title: 'Point of Sale',
    description: 'Build an order from your listings and charge with Lightning.',
  });

  const lightningAddress = metadata?.lud16;

  const lines = useMemo(() => Object.values(cart).filter((l) => l.qty > 0), [cart]);

  const totalSats = useMemo(() => {
    let sum = 0;
    for (const line of lines) {
      const s = toSats(line.price * line.qty, line.currency, btcPrices);
      if (s !== null) sum += s;
    }
    return sum;
  }, [lines, btcPrices]);

  const hasUnconvertible = lines.some((l) => toSats(l.price, l.currency, btcPrices) === null);

  const visibleListings = useMemo(() => {
    if (!listings) return [];

    const q = search.trim().toLowerCase();
    const filtered = q
      ? listings.filter((ev) => (tagValue(ev.tags, 'title') ?? '').toLowerCase().includes(q))
      : listings;

    const priceOf = (ev: NostrEvent) => {
      const p = ev.tags.find(([t]) => t === 'price')?.[1];
      const n = p !== undefined ? parseFloat(p) : NaN;
      return Number.isFinite(n) ? n : 0;
    };
    const nameOf = (ev: NostrEvent) => (tagValue(ev.tags, 'title') ?? '').toLowerCase();

    const sorted = [...filtered];
    switch (sortMode) {
      case 'newest':
        sorted.sort((a, b) => b.created_at - a.created_at);
        break;
      case 'oldest':
        sorted.sort((a, b) => a.created_at - b.created_at);
        break;
      case 'name-asc':
        sorted.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        break;
      case 'name-desc':
        sorted.sort((a, b) => nameOf(b).localeCompare(nameOf(a)));
        break;
      case 'price-asc':
        sorted.sort((a, b) => priceOf(a) - priceOf(b));
        break;
      case 'price-desc':
        sorted.sort((a, b) => priceOf(b) - priceOf(a));
        break;
      case 'stock-asc':
        sorted.sort((a, b) => currentQty(a) - currentQty(b));
        break;
      case 'stock-desc':
        sorted.sort((a, b) => currentQty(b) - currentQty(a));
        break;
    }
    return sorted;
  }, [listings, search, sortMode]);

  if (!user) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-12 text-center space-y-6">
        <div>
          <Zap className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">Point of Sale</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to build an order from your listings.
          </p>
        </div>
        <LoginArea />
      </div>
    );
  }

  const addToCart = (ev: NostrEvent) => {
    const d = tagValue(ev.tags, 'd');
    if (!d) return;
    const priceTag = ev.tags.find(([t]) => t === 'price');
    const price = priceTag ? parseFloat(priceTag[1]) : NaN;
    if (!Number.isFinite(price)) {
      toast.error('This item has no price set.');
      return;
    }
    const currency = priceTag?.[2] ?? 'USD';
    const managed = hasStockTag(ev);
    const stock = currentQty(ev);
    const title = tagValue(ev.tags, 'title') ?? '(untitled)';

    setCart((prev) => {
      const existing = prev[d];
      const nextQty = (existing?.qty ?? 0) + 1;
      if (managed && nextQty > stock) {
        toast.error(`Only ${stock} in stock.`);
        return prev;
      }
      return {
        ...prev,
        [d]: { d, title, price, currency, managed, stock, qty: nextQty, sourceEvent: ev },
      };
    });
  };

  const adjustQty = (d: string, delta: number) => {
    setCart((prev) => {
      const line = prev[d];
      if (!line) return prev;
      const nextQty = Math.max(0, line.qty + delta);
      if (line.managed && nextQty > line.stock) return prev;
      return { ...prev, [d]: { ...line, qty: nextQty } };
    });
  };

  const removeLine = (d: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[d];
      return next;
    });
  };

  const clearCart = () => {
    setCart({});
    setMemo('');
  };

  const handleCharge = () => {
    if (lines.length === 0 || totalSats <= 0) return;
    setReceiptSnapshot(lines);
    setDialogOpen(true);
  };

  const handlePaid = async () => {
    if (charging) return;
    setCharging(true);
    try {
      let ok = 0;
      let failed = 0;
      const updated: NostrEvent[] = [];
      for (const line of lines) {
        if (!line.managed) continue;
        const ev = line.sourceEvent;
        const newQty = Math.max(0, currentQty(ev) - line.qty);
        const newTags = withUpdatedStock(ev.tags, newQty);
        try {
          const published = await publishEvent({ kind: 30402, content: ev.content, tags: newTags });
          updated.push(published);
          ok++;
        } catch (err) {
          console.error('inventory update failed for', line.d, err);
          failed++;
        }
      }
      toast.success('Payment received — order complete.');
      if (failed) toast.error(`${failed} item${failed === 1 ? '' : 's'} failed to update inventory.`);

      // Patch the cache with the events we just published so the UI reflects the
      // new stock immediately, rather than waiting on a relay refetch to catch up
      // (relays are eventually consistent and can briefly return the stale event).
      if (updated.length > 0 && user) {
        const byD = new Map(updated.map((e) => [tagValue(e.tags, 'd'), e]));
        queryClient.setQueryData<NostrEvent[]>(['nip99-listings', user.pubkey], (old) =>
          old?.map((e) => {
            const d = tagValue(e.tags, 'd');
            return d && byD.has(d) ? byD.get(d)! : e;
          }),
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['nip99-listings'] });
      clearCart();
    } finally {
      setCharging(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 pb-40 space-y-5">
      <NavTabs />

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Point of Sale</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border p-0.5">
            <Button
              variant={viewMode === 'image' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('image')}
              title="Image view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh" disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <LoginArea />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="w-[160px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading listings…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
            <p className="text-sm">Failed to load listings.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && listings && listings.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No listings found.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && listings && listings.length > 0 && visibleListings.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No items match "{search}".
          </CardContent>
        </Card>
      )}

      {visibleListings.length > 0 && viewMode === 'image' && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {visibleListings.map((ev) => {
            const d = tagValue(ev.tags, 'd');
            if (!d) return null;
            const title = tagValue(ev.tags, 'title') ?? '(untitled)';
            const image = tagValue(ev.tags, 'image');
            const priceTag = ev.tags.find(([t]) => t === 'price');
            const managed = hasStockTag(ev);
            const stock = currentQty(ev);
            const inCart = cart[d]?.qty ?? 0;
            const outOfStock = managed && stock - inCart <= 0;

            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => addToCart(ev)}
                disabled={outOfStock || !priceTag}
                className={cn(
                  'group relative aspect-square rounded-lg overflow-hidden border bg-muted',
                  'focus:outline-none focus:ring-2 focus:ring-ring ring-offset-1',
                  'transition-transform active:scale-95',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                )}
                aria-label={`Add ${title} to order`}
              >
                {image ? (
                  <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <ImageOff className="h-6 w-6" />
                  </div>
                )}

                {inCart > 0 && (
                  <div className="absolute top-1 right-1 min-w-[1.75rem] h-7 px-1.5 rounded-full flex items-center justify-center text-sm font-bold text-white bg-primary shadow-md">
                    {inCart}
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1">
                  <p className="text-[11px] leading-tight text-white truncate">{title}</p>
                  <p className="text-[10px] leading-tight text-white/80">
                    {priceTag ? `${priceTag[1]} ${priceTag[2] ?? 'USD'}` : 'no price'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {visibleListings.length > 0 && viewMode === 'list' && (
        <div className="rounded-lg border divide-y overflow-hidden">
          {visibleListings.map((ev) => {
            const d = tagValue(ev.tags, 'd');
            if (!d) return null;
            const title = tagValue(ev.tags, 'title') ?? '(untitled)';
            const image = tagValue(ev.tags, 'image');
            const priceTag = ev.tags.find(([t]) => t === 'price');
            const managed = hasStockTag(ev);
            const stock = currentQty(ev);
            const inCart = cart[d]?.qty ?? 0;
            const outOfStock = managed && stock - inCart <= 0;

            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => addToCart(ev)}
                disabled={outOfStock || !priceTag}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 bg-background text-left',
                  'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                )}
                aria-label={`Add ${title} to order`}
              >
                <div className="h-10 w-10 shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center">
                  {image ? (
                    <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <ImageOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {priceTag ? `${priceTag[1]} ${priceTag[2] ?? 'USD'}` : 'no price'}
                    {managed && ` · ${stock} in stock`}
                  </p>
                </div>

                {inCart > 0 && (
                  <div className="min-w-[1.75rem] h-7 px-1.5 rounded-full flex items-center justify-center text-sm font-bold text-white bg-primary shrink-0">
                    {inCart}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-4 py-3">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {lines.map((line) => (
                <div key={line.d} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{line.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {line.price} {line.currency}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => adjustQty(line.d, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-5 text-center">{line.qty}</span>
                    <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => adjustQty(line.d, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeLine(line.d)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {hasUnconvertible && (
              <p className="text-xs text-destructive">
                One or more items use an unsupported currency and won't be included in the sats total.
              </p>
            )}

            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Add a memo (optional)"
              className="h-9"
            />

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={clearCart}>Clear</Button>
              <Button
                className="flex-1 h-12 text-base"
                onClick={handleCharge}
                disabled={totalSats <= 0}
              >
                <Zap className="h-4 w-4 mr-2" />
                Charge {totalSats.toLocaleString()} sats
              </Button>
            </div>
          </div>
        </div>
      )}

      <PaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lightningAddress={lightningAddress}
        sats={totalSats}
        comment={(memo.trim() || `Order: ${lines.map((l) => `${l.qty}x ${l.title}`).join(', ')}`).slice(0, 200)}
        onPaid={handlePaid}
        receiptLines={receiptSnapshot.map((l) => ({ title: l.title, qty: l.qty, price: l.price, currency: l.currency }))}
      />
    </div>
  );
}
