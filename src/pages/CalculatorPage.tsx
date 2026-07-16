import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Delete, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoginArea } from '@/components/auth/LoginArea';
import { NavTabs } from '@/components/NavTabs';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserListings } from '@/hooks/useUserListings';
import { useBtcPrice, toSats } from '@/hooks/useBtcPrice';
import { PaymentDialog } from '@/components/pos/PaymentDialog';
import { cn } from '@/lib/utils';

type Operator = '+' | '-' | '×' | '÷';

const CURRENCY_SYMBOLS: Partial<Record<string, string>> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', CHF: 'CHF', AUD: 'AU$', JPY: '¥',
};

/** Most frequently used price currency across the seller's own listings. */
function useDefaultCurrency(): string {
  const { data: listings } = useUserListings();

  return useMemo(() => {
    if (!listings || listings.length === 0) return 'USD';
    const counts = new Map<string, number>();
    for (const ev of listings) {
      const code = ev.tags.find(([t]) => t === 'price')?.[2];
      if (!code) continue;
      const key = code.trim().toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size === 0) return 'USD';
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }, [listings]);
}

function applyOperator(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? 0 : a / b;
  }
}

function formatResult(n: number): string {
  if (!Number.isFinite(n)) return '0';
  // Trim floating point noise (e.g. 0.1 + 0.2) without mangling large numbers.
  const rounded = Math.round(n * 1e8) / 1e8;
  return String(rounded);
}

export default function CalculatorPage() {
  const { user, metadata } = useCurrentUser();
  const { data: btcPrices } = useBtcPrice();
  const currency = useDefaultCurrency();

  const [display, setDisplay] = useState('0');
  const [operand, setOperand] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [memo, setMemo] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chargedAmount, setChargedAmount] = useState(0);

  useSeoMeta({
    title: 'Calculator',
    description: 'Do the math, then charge it with Lightning.',
  });

  const isSats = currency === 'SAT' || currency === 'SATS';
  const amount = parseFloat(display) || 0;
  const sats = useMemo(() => toSats(amount, currency, btcPrices) ?? 0, [amount, currency, btcPrices]);
  const lightningAddress = metadata?.lud16;

  const resetAll = () => {
    setDisplay('0');
    setOperand(null);
    setOperator(null);
    setWaitingForOperand(false);
  };

  const handleDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
      return;
    }
    setDisplay((prev) => {
      if (prev === '0') return digit;
      if (prev.length >= 12) return prev;
      return prev + digit;
    });
  };

  const handleDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (display.includes('.')) return;
    setDisplay((prev) => `${prev}.`);
  };

  const handleBackspace = () => {
    if (waitingForOperand) return;
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const handleOperator = (op: Operator) => {
    const current = parseFloat(display) || 0;

    if (operator && !waitingForOperand && operand !== null) {
      const result = applyOperator(operand, current, operator);
      setDisplay(formatResult(result));
      setOperand(result);
    } else {
      setOperand(current);
    }

    setOperator(op);
    setWaitingForOperand(true);
  };

  const handleEquals = () => {
    if (operator === null || operand === null) return;
    const current = parseFloat(display) || 0;
    const result = applyOperator(operand, current, operator);
    setDisplay(formatResult(result));
    setOperand(null);
    setOperator(null);
    setWaitingForOperand(true);
  };

  if (!user) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-12 text-center space-y-6">
        <NavTabs />
        <div>
          <Zap className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">Calculator</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to charge a custom amount.
          </p>
        </div>
        <LoginArea />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 space-y-5">
      <NavTabs />

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Calculator</h1>
        <LoginArea />
      </div>

      <p className="text-xs text-muted-foreground">
        Charging in <span className="font-medium text-foreground">{currency}</span> — based on your listing prices
      </p>

      <div className="rounded-lg border bg-muted/40 px-4 py-8 text-right">
        {operator && (
          <p className="text-sm text-muted-foreground truncate">
            {operand !== null ? formatResult(operand) : ''} {operator}
          </p>
        )}
        <p className="text-4xl font-mono font-semibold truncate">
          {CURRENCY_SYMBOLS[currency] ?? ''}{display}{isSats ? ' sats' : ''}
        </p>
        {!isSats && (
          <p className="text-sm text-muted-foreground mt-1">
            ≈ {sats.toLocaleString()} sats
          </p>
        )}
      </div>

      <Input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="Add a memo (optional)"
      />

      <div className="grid grid-cols-4 gap-2">
        <Button variant="outline" className="h-16 text-lg font-medium" onClick={resetAll}>C</Button>
        <Button variant="outline" className="h-16 text-lg font-medium" onClick={handleBackspace}>
          <Delete className="h-5 w-5" />
        </Button>
        <Button variant="outline" className="h-16 text-2xl font-medium col-span-2" onClick={() => handleOperator('÷')}>÷</Button>

        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleDigit('7')}>7</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleDigit('8')}>8</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleDigit('9')}>9</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleOperator('×')}>×</Button>

        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleDigit('4')}>4</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleDigit('5')}>5</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleDigit('6')}>6</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleOperator('-')}>−</Button>

        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleDigit('1')}>1</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleDigit('2')}>2</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleDigit('3')}>3</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={() => handleOperator('+')}>+</Button>

        <Button variant="outline" className="h-16 text-2xl font-medium col-span-2" onClick={() => handleDigit('0')}>0</Button>
        <Button variant="outline" className="h-16 text-2xl font-medium" onClick={handleDecimal}>.</Button>
        <Button className="h-16 text-2xl font-medium" onClick={handleEquals}>=</Button>
      </div>

      <Button
        className={cn('w-full h-12 text-base')}
        disabled={sats <= 0}
        onClick={() => {
          setChargedAmount(amount);
          setDialogOpen(true);
        }}
      >
        <Zap className="h-4 w-4 mr-2" />
        Charge
      </Button>

      <PaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lightningAddress={lightningAddress}
        sats={sats}
        comment={memo.trim() || 'Custom amount'}
        receiptLines={[{ title: 'Custom amount', qty: 1, price: chargedAmount, currency }]}
        onPaid={() => {
          resetAll();
          setMemo('');
        }}
      />
    </div>
  );
}
