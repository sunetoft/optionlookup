'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Crosshair, LogOut, User, DollarSign, ChevronDown, Flame } from 'lucide-react';

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or route change
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => setAccountOpen(false), [pathname]);

  const isAdmin = session?.user?.role === 'ADMIN';

  const navLinks = [
    { href: '/dashboard', label: 'Analyze', icon: Search },
    { href: '/scanner', label: 'CSP Scanner', icon: Crosshair },
    { href: '/pricing', label: 'Pricing', icon: DollarSign },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard' && pathname === '/') return true;
    return pathname?.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
      <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <Search className="h-4 w-4 text-white" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight hidden sm:block">
            OptionLookup
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Auth Section */}
        <div className="flex items-center gap-2">
          {status === 'authenticated' ? (
            <div className="flex items-center gap-2">
              <div ref={accountRef} className="relative">
                <button
                  onClick={() => setAccountOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden md:inline max-w-[120px] truncate">
                    {session?.user?.name ?? session?.user?.email ?? 'Account'}
                  </span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {accountOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-lg border border-border bg-popover shadow-lg overflow-hidden z-50">
                    <Link
                      href="/account"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <User className="h-4 w-4" />
                      Account Settings
                    </Link>
                    {isAdmin && (
                      <Link
                        href="/scanner/heatmap"
                        className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-amber-500"
                      >
                        <Flame className="h-4 w-4" />
                        CSP Heatmap
                      </Link>
                    )}
                    <div className="border-t border-border">
                      <button
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors w-full text-left"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : status === 'unauthenticated' ? (
            <>
              <Link
                href="/login?mode=signup"
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                Sign Up
              </Link>
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                Sign In
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
