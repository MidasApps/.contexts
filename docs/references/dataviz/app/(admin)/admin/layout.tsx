'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/app/layouts/DashboardLayout';
import { useAuthContext } from '@/features/auth/providers/AuthProvider';
import { Skeleton } from '@/shared/ui/skeleton';
import { isAdminEmail } from '@/shared/lib/runtime-config';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();
  const router = useRouter();
  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    if (loading) return;
    if (!user || !isAdmin) {
      router.replace('/dashboard');
    }
  }, [loading, user, isAdmin, router]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-4 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user || !isAdmin) return null;

  return <DashboardLayout>{children}</DashboardLayout>;
}
