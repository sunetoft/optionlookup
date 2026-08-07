import './fonts.css';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import { Footer } from '@/components/footer';
import { Navbar } from '@/components/navbar';
import './globals.css';




export const metadata: Metadata = {
  metadataBase: new URL('https://optionlookup.bunnystocks.com'),
  title: 'OptionLookup — Wheel Strategy Analysis',
  description: 'Analyze stocks, calculate expected moves, and find optimal put selling opportunities.',
  alternates: {
    canonical: 'https://optionlookup.bunnystocks.com',
  },
  openGraph: {
    title: 'OptionLookup — Wheel Strategy Analysis',
    description: 'Analyze stocks, calculate expected moves, and find optimal put selling opportunities.',
    url: 'https://optionlookup.bunnystocks.com',
    siteName: 'OptionLookup',
    locale: 'en_US',
    type: 'website',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OptionLookup — Wheel Strategy Analysis',
    description: 'Analyze stocks, calculate expected moves, and find optimal put selling opportunities.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'OptionLookup',
              description:
                'Wheel strategy analysis tool — analyze stocks, calculate expected moves, and find optimal put selling opportunities.',
              url: 'https://optionlookup.bunnystocks.com',
              applicationCategory: 'FinanceApplication',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
            }),
          }}
        />
        <Providers>
          <Navbar />
          {children}
        </Providers>
        <Footer />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
