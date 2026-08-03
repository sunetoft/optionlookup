import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ScannerDashboard } from '@/components/scanner/scanner-dashboard';

export default async function ScannerPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login?callbackUrl=/scanner');
  }

  return <ScannerDashboard />;
}
