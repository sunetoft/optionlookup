import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser } from '@/lib/subscription';
import { HeatmapDashboard } from '@/components/scanner/heatmap-dashboard';

export default async function HeatmapPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login?callbackUrl=/scanner/heatmap');
  }

  const isAdmin = await isAdminUser(session.user.id);
  if (!isAdmin) {
    redirect('/scanner');
  }

  return <HeatmapDashboard />;
}
