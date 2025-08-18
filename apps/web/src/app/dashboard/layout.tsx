import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout } from '@/components/layout';

export default function DashboardLayoutPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireAuth={true}>
      <DashboardLayout>{children}</DashboardLayout>
    </ProtectedRoute>
  );
}
