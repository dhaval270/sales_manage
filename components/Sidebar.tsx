'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  ShoppingCart,
  DollarSign,
  Package,
  Store,
  Users,
  Settings,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/customers', label: 'Customers', icon: Users },
  { href: '/dashboard/products', label: 'Products', icon: ShoppingCart },
  { href: '/dashboard/sales', label: 'Sales', icon: DollarSign },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Package },
  { href: '/dashboard/center', label: 'Center', icon: Store },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  userName?: string;
}

export function Sidebar({ userName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center h-14 px-4 border-b bg-background gap-3">
        <button
          onMouseEnter={() => setOpen(true)}
          onClick={() => setOpen(prev => !prev)}
          className="flex flex-col justify-center items-center gap-1.5 p-2 rounded-md hover:bg-accent transition-colors w-9 h-9 flex-shrink-0"
          aria-label="Toggle menu"
        >
          <span className={cn('block h-0.5 w-5 bg-foreground rounded-full transition-all duration-200', open && 'rotate-45 translate-y-2')} />
          <span className={cn('block h-0.5 w-5 bg-foreground rounded-full transition-all duration-200', open && 'opacity-0')} />
          <span className={cn('block h-0.5 w-5 bg-foreground rounded-full transition-all duration-200', open && '-rotate-45 -translate-y-2')} />
        </button>

        <div className="flex items-center gap-2">
          <Image src="/herbalife-logo.png" alt="Herbalife" width={28} height={28} className="object-contain" />
          <div>
            <p className="font-semibold text-sm leading-tight">Herbalife Manager</p>
            {userName && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{userName}</p>}
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed left-0 top-14 bottom-0 z-40 w-56 border-r bg-background flex flex-col shadow-lg transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-2 pb-4 border-t pt-4">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>
    </>
  );
}
