import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Loader2, CheckCircle2, XCircle, Zap, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { resolveLnurlp, requestInvoice, verifyInvoice, getWebLn } from '@/lib/lightning';
import { resolveRecipientPubkey, sendReceiptDm, formatReceipt } from '@/lib/receiptDm';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostr } from '@nostrify/react';

export interface ReceiptLine {
  title: string;
  qty: number;
  price: number;
  currency: string;
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lightningAddress: string | undefined;
  sats: number;
  comment?: string;
  onPaid: () => void;
  /** Line items to include in an optional DM receipt sent after payment. */
  receiptLines?: ReceiptLine[];
}

type Status = 'creating' | 'ready' | 'polling' | 'paid' | 'error';
type ReceiptStatus = 'idle' | 'sending' | 'sent' | 'error';

export function PaymentDialog({ open, onOpenChange, lightningAddress, sats, comment, onPaid, receiptLines }: PaymentDialogProps) {
  const { user, metadata } = useCurrentUser();
  const { nostr } = useNostr();

  const [status, setStatus] = useState<Status>('creating');
  const [invoice, setInvoice] = useState<string>('');
  const [verifyUrl, setVerifyUrl] = useState<string | undefined>();
  const [error, setError] = useState<string>('');
  const [chargedSats, setChargedSats] = useState(sats);
  const [receiptTo, setReceiptTo] = useState('');
  const [receiptStatus, setReceiptStatus] = useState<ReceiptStatus>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Snapshot props at the instant the dialog opens so a later re-render
  // (e.g. the BTC price refetching) can't regenerate the invoice mid-payment.
  const latestProps = useRef({ lightningAddress, sats, comment });
  latestProps.current = { lightningAddress, sats, comment };

  useEffect(() => {
    if (!open) return;

    const { lightningAddress, sats, comment } = latestProps.current;
    const abort = new AbortController();
    setStatus('creating');
    setError('');
    setInvoice('');
    setVerifyUrl(undefined);
    setChargedSats(sats);
    setReceiptTo('');
    setReceiptStatus('idle');

    (async () => {
      if (!lightningAddress) {
        setError('No lightning address set on your profile (lud16). Add one to your Nostr profile to accept payments.');
        setStatus('error');
        return;
      }
      try {
        const params = await resolveLnurlp(lightningAddress, abort.signal);
        const inv = await requestInvoice(params, sats, comment, abort.signal);
        if (abort.signal.aborted) return;
        setInvoice(inv.pr);
        setVerifyUrl(inv.verify);
        setStatus(inv.verify ? 'polling' : 'ready');
      } catch (err) {
        if (abort.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to create invoice');
        setStatus('error');
      }
    })();

    return () => abort.abort();
    // Only (re)create the invoice when the dialog transitions open — not on every prop recompute.
  }, [open]);

  useEffect(() => {
    if (status !== 'polling' || !verifyUrl) return;

    const tick = async () => {
      try {
        const settled = await verifyInvoice(verifyUrl);
        if (settled) {
          setStatus('paid');
          onPaid();
        }
      } catch {
        // transient network errors are fine to ignore; keep polling
      }
    };

    pollRef.current = setInterval(tick, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, verifyUrl, onPaid]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(invoice);
    toast.success('Invoice copied');
  };

  const handleWebLnPay = async () => {
    const webln = getWebLn();
    if (!webln) {
      toast.error('No WebLN wallet detected in this browser');
      return;
    }
    try {
      await webln.enable();
      await webln.sendPayment(invoice);
      setStatus('paid');
      onPaid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'WebLN payment failed');
    }
  };

  const handleSendReceipt = async () => {
    if (!user || !receiptTo.trim()) return;
    setReceiptStatus('sending');
    try {
      const recipientPubkey = await resolveRecipientPubkey(receiptTo);
      const content = formatReceipt({
        sellerName: metadata?.name ?? metadata?.display_name,
        lines: receiptLines ?? [],
        totalSats: chargedSats,
        memo: comment,
      });
      await sendReceiptDm(user, recipientPubkey, content, nostr);
      setReceiptStatus('sent');
      toast.success('Receipt sent');
    } catch (err) {
      setReceiptStatus('error');
      toast.error(err instanceof Error ? err.message : 'Failed to send receipt');
    }
  };

  const handleClose = (next: boolean) => {
    if (!next && pollRef.current) clearInterval(pollRef.current);
    onOpenChange(next);
  };

  // Auto-dismiss once the receipt is sent (or after a longer grace period if the
  // seller never fills it in) — but only while they're not mid-typing a receipt address.
  useEffect(() => {
    if (status !== 'paid') return;
    if (receiptStatus === 'sending') return;

    const delay = receiptStatus === 'sent' ? 3000 : receiptTo.trim() ? undefined : 15000;
    if (delay === undefined) return;

    const timer = setTimeout(() => onOpenChange(false), delay);
    return () => clearTimeout(timer);
  }, [status, receiptStatus, receiptTo, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Charge {chargedSats.toLocaleString()} sats
          </DialogTitle>
          <DialogDescription>
            Have the customer scan this invoice to pay.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {(status === 'creating') && (
            <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Creating invoice…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="w-full py-8 flex flex-col items-center gap-3 text-center">
              <XCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button className="w-full h-12 text-base mt-2" onClick={() => handleClose(false)}>
                Close
              </Button>
            </div>
          )}

          {status === 'paid' && (
            <div className="w-full py-4 flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="text-sm font-medium">Payment received!</p>

              {receiptStatus === 'sent' ? (
                <p className="text-xs text-muted-foreground">Receipt sent. Closing…</p>
              ) : (
                <div className="w-full space-y-2 text-left">
                  <p className="text-xs text-muted-foreground">
                    Send the buyer a DM receipt (optional)
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={receiptTo}
                      onChange={(e) => setReceiptTo(e.target.value)}
                      placeholder="npub or name@domain.com"
                      className="flex-1"
                    />
                    <Button
                      size="icon"
                      onClick={handleSendReceipt}
                      disabled={!receiptTo.trim() || receiptStatus === 'sending'}
                      title="Send receipt"
                    >
                      {receiptStatus === 'sending' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <Button variant="outline" className="w-full h-12 text-base" onClick={() => handleClose(false)}>
                Close
              </Button>
            </div>
          )}

          {(status === 'ready' || status === 'polling') && invoice && (
            <>
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG value={invoice.toUpperCase()} size={220} />
              </div>
              <p className="text-xs text-muted-foreground break-all text-center px-2 line-clamp-2">
                {invoice}
              </p>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1" onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                {getWebLn() && (
                  <Button variant="outline" className="flex-1" onClick={handleWebLnPay}>
                    <Zap className="h-4 w-4 mr-2" />
                    Pay with WebLN
                  </Button>
                )}
              </div>

              {status === 'polling' ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for payment…
                </p>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => {
                    setStatus('paid');
                    onPaid();
                  }}
                >
                  I've been paid
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
