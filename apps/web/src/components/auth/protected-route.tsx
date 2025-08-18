'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
}

// Mock authentication hook - in real app this would use actual auth context
function useAuth() {
  const pathname = usePathname();

  // Simple mock: consider user authenticated if on dashboard routes
  const isAuthenticated = pathname.startsWith('/dashboard');
  const isLoading = false; // In real app, this would track auth loading state

  return {
    isAuthenticated,
    isLoading,
    user: isAuthenticated ? { id: '1', name: 'John Doe', email: 'john@example.com' } : null,
  };
}

export function ProtectedRoute({ children, requireAuth = true, redirectTo }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || isLoading) return;

    if (requireAuth && !isAuthenticated) {
      // Redirect to login with return URL
      const returnUrl = encodeURIComponent(pathname);
      router.push(redirectTo || `/auth/login?returnUrl=${returnUrl}`);
    } else if (!requireAuth && isAuthenticated) {
      // Redirect authenticated users away from auth pages
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, requireAuth, router, pathname, redirectTo, mounted]);

  // Show loading state
  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Show nothing while redirecting
  if (requireAuth && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!requireAuth && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}
