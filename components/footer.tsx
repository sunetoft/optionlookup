export function Footer() {
  const sites = [
    { label: 'BunnyStocks', href: 'https://bunnystocks.com' },
    { label: 'Warren', href: 'https://warren.bunnystocks.com' },
    { label: 'ThemeInvestor', href: 'https://themeinvestor.bunnystocks.com' },
    { label: 'OptionLookup', href: 'https://optionlookup.bunnystocks.com' },
    { label: 'HoldSell', href: 'https://holdsell.bunnystocks.com' },
    { label: 'TradeScouter', href: 'https://tradescouter.bunnystocks.com' },
  ];

  return (
    <footer className="border-t border-border/40 bg-background/80">
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {sites.map((site) => (
            <a
              key={site.href}
              href={site.href}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {site.label}
            </a>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} OptionLookup. For educational purposes only.
        </p>
      </div>
    </footer>
  );
}
