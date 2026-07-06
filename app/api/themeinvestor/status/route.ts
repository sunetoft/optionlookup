export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Internal endpoint for the OptionLookup dashboard.
// Checks whether the current user is also registered on Themeinvestor
// (ThemeValidator).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email;
  if (!email) {
    return NextResponse.json({ registered: false });
  }

  const tvUrl = process.env.THEMEVALIDATOR_INTERNAL_URL;
  const apiKey = process.env.CROSS_SITE_API_KEY;

  if (!tvUrl || !apiKey) {
    // Themeinvestor integration not configured
    return NextResponse.json({ registered: false });
  }

  try {
    const res = await fetch(
      `${tvUrl}/api/external/user-exists?email=${encodeURIComponent(email)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        // Don't cache — registration status can change
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return NextResponse.json({ registered: false });
    }

    const data = await res.json();
    return NextResponse.json({ registered: !!data?.exists });
  } catch (error) {
    console.error('themeinvestor status error:', error);
    // If Themeinvestor is unreachable, treat as not registered
    return NextResponse.json({ registered: false });
  }
}
