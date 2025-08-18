import { MfaVerificationForm } from '@/components/auth';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Two-Factor Authentication - Fullstack Monolith',
  description: 'Complete your two-factor authentication',
};

interface MfaPageProps {
  searchParams: {
    method?: 'totp' | 'sms' | 'email';
  };
}

export default function MfaPage({ searchParams }: MfaPageProps) {
  const method = searchParams.method || 'totp';

  // Validate method
  if (!['totp', 'sms', 'email'].includes(method)) {
    redirect('/auth/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Almost there!</h1>
          <p className="text-gray-600">Complete your authentication to continue</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
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
    </div>
  );
}
