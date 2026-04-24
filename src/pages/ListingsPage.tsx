import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Minus, Tag, AlertCircle, ImageOff, RefreshCw, RotateCcw } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserListings } from '@/hooks/useUserListings';
import { useNostrPublish } from '@/hooks/useNostrPublish';

type Mode = 'add' | 'remove';

function tagValue(tags: string[][], name: string): string | undefined {
  return tags.find(([t]) => t === name)?.[1];
}

function hasStockTag(ev: NostrEvent): boolean {
  return ev.tags.some(([t]) => t === 'stock' || t === 'quantity');
}

function currentQty(ev: NostrEvent): number {
  // Gamma Markets spec uses `stock`; Postr writes `quantity` — read both.
  const q = tagValue(ev.tags, 'stock') ?? tagValue(ev.tags, 'quantity');
  const n = q !== undefined ? parseInt(q, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function ListingsPage() {
  const { user } = useCurrentUser();
  const { data: listings, isLoading, isError, refetch } = useUserListings();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>('add');
  const [pending, setPending] = useState<Record<string, number>>({});

  useSeoMeta({
    title: 'NIP-99 Inventory',
    description: 'Quickly adjust stock on your Nostr classified listings.',
  });

  const pendingCount = useMemo(
    () => Object.values(pending).reduce((n, v) => n + (v !== 0 ? 1 : 0), 0),
    [pending],
  );
  const hasPending = pendingCount > 0;

  if (!user) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-12 text-center space-y-6">
        <div>
          <Tag className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">Nostr Stock Updater</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to adjust stock on your existing classified listings.
          </p>
        </div>
        <LoginArea />
      </div>
    );
  }

  const handleTap = (d: string, qty: number) => {
    setPending((prev) => {
      const delta = mode === 'add' ? 1 : -1;
      const next = (prev[d] ?? 0) + delta;
      const floored = Math.max(-qty, next);
      return { ...prev, [d]: floored };
    });
  };

  const handleReset = () => setPending({});

  const handleUpdate = async () => {
    if (!listings) return;
    const targets = listings.filter((ev) => {
      const d = tagValue(ev.tags, 'd');
      return d !== undefined && (pending[d] ?? 0) !== 0;
    });
    if (targets.length === 0) return;

    let ok = 0;
    let failed = 0;
    for (const ev of targets) {
      const d = tagValue(ev.tags, 'd')!;
      const delta = pending[d] ?? 0;
      const newQty = Math.max(0, currentQty(ev) + delta);
      const newTags = ev.tags
        .filter(([t]) => t !== 'stock' && t !== 'quantity')
        .concat([['stock', String(newQty)]]);
      try {
        await publishEvent({ kind: 30402, content: ev.content, tags: newTags });
        ok++;
      } catch (err) {
        console.error('update failed for', d, err);
        failed++;
      }
    }

    if (ok) toast.success(`Updated ${ok} listing${ok === 1 ? '' : 's'}.`);
    if (failed) toast.error(`${failed} listing${failed === 1 ? '' : 's'} failed to publish.`);
    setPending({});
    await queryClient.invalidateQueries({ queryKey: ['nip99-listings'] });
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 pb-32 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            title="Refresh"
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <LoginArea />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant={mode === 'add' ? 'default' : 'outline'}
          onClick={() => setMode('add')}
          className={cn(
            'h-14 text-lg',
            mode === 'add' && 'bg-emerald-600 hover:bg-emerald-700 text-white',
          )}
        >
          <Plus className="h-6 w-6 mr-2" />
          Add
        </Button>
        <Button
          size="lg"
          variant={mode === 'remove' ? 'default' : 'outline'}
          onClick={() => setMode('remove')}
          className={cn(
            'h-14 text-lg',
            mode === 'remove' && 'bg-rose-600 hover:bg-rose-700 text-white',
          )}
        >
          <Minus className="h-6 w-6 mr-2" />
          Remove
        </Button>
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

      {listings && listings.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {listings.map((ev) => {
            const d = tagValue(ev.tags, 'd');
            if (!d) return null;
            const title = tagValue(ev.tags, 'title') ?? '(untitled)';
            const image = tagValue(ev.tags, 'image');
            const qty = currentQty(ev);
            const delta = pending[d] ?? 0;
            const projected = Math.max(0, qty + delta);
            const managed = hasStockTag(ev);
            const status = tagValue(ev.tags, 'status');
            const unmanaged = !managed && status !== 'sold';
            const atFloor = mode === 'remove' && !unmanaged && projected === 0;
            const visibility = tagValue(ev.tags, 'visibility');
            const dimmed = (!unmanaged && projected === 0) || visibility === 'hidden';

            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => handleTap(d, qty)}
                disabled={isPublishing || atFloor}
                className={cn(
                  'group relative aspect-square rounded-lg overflow-hidden border bg-muted',
                  'focus:outline-none focus:ring-2 focus:ring-ring ring-offset-1',
                  'transition-transform active:scale-95',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                )}
                aria-label={`${mode === 'add' ? 'Add to' : 'Remove from'} ${title}`}
              >
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className={cn('h-full w-full object-cover', dimmed && 'grayscale opacity-80')}
                    loading="lazy"
                  />
                ) : (
                  <div className={cn('h-full w-full flex items-center justify-center text-muted-foreground', dimmed && 'grayscale opacity-80')}>
                    <ImageOff className="h-6 w-6" />
                  </div>
                )}

                {/* Current stock (top-left) */}
                <div className="absolute top-1 left-1 rounded-md bg-black/60 text-white text-xs px-1.5 py-0.5">
                  {unmanaged ? 'active' : projected}
                </div>

                {/* Pending delta (top-right) */}
                {delta !== 0 && (
                  <div
                    className={cn(
                      'absolute top-1 right-1 min-w-[1.75rem] h-7 px-1.5 rounded-full flex items-center justify-center',
                      'text-sm font-bold text-white shadow-md',
                      delta > 0 ? 'bg-emerald-600' : 'bg-rose-600',
                    )}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </div>
                )}

                {/* Title caption (overlay bottom) */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1">
                  <p className="text-[11px] leading-tight text-white truncate">{title}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Sticky update bar */}
      {hasPending && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={handleReset}
              disabled={isPublishing}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button
              className="flex-1 h-12 text-base"
              onClick={handleUpdate}
              disabled={isPublishing}
            >
              {isPublishing
                ? 'Publishing…'
                : `Update ${pendingCount} item${pendingCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
