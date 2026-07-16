import { Link, useLocation } from 'react-router-dom';
import { Boxes, ShoppingCart, Calculator } from 'lucide-react';

import { cn } from '@/lib/utils';

const tabs = [
  { to: '/', label: 'Inventory', icon: Boxes },
  { to: '/pos', label: 'POS', icon: ShoppingCart },
  { to: '/calculator', label: 'Calculator', icon: Calculator },
];

export function NavTabs() {
  const { pathname } = useLocation();

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pt-4">
      <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
