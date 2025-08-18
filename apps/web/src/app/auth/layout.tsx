import { ProtectedRoute } from '@/components/auth/protected-route';
import { AuthLayout } from '@/components/layout';

export default function AuthLayoutPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireAuth={false}>
      <AuthLayout>{children}</AuthLayout>
    </ProtectedRoute>
  );
}
