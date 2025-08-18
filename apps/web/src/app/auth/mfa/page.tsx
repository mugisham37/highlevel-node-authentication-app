import { MfaVerificationForm } from '@/components/auth';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Two-Factor Authentication - Fullstack Monolith',
  description: 'Complete your two-factor authentication',
};

interface MfaPageProps {
  searchParams: Promise<{
    method?: 'totp' | 'sms' | 'email';
  }>;
}

export default async function MfaPage({ searchParams }: MfaPageProps) {
  const params = await searchParams;
  const method = params.method || 'totp';

  // Validate method
  if (!['totp', 'sms', 'email'].includes(method)) {
    redirect('/auth/login');
  }

  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Almost there!</h1>
      <p className="text-gray-600">Complete your authentication to continue</p>

      <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <MfaVerificationForm
          method={method}
          onCancel={() => {
            // Handle logout and redirect to login
            localStorage.removeItem('auth-token');
            localStorage.removeItem('refresh-token');
            window.location.href = '/auth/login';
          }}
        />
      </div>
    </div>
  );
}
