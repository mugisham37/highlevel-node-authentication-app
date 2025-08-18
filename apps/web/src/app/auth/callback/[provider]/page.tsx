'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

interface CallbackPageProps {
  params: Promise<{
    provider: string;
  }>;
}

function CallbackContent({ params }: CallbackPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [provider, setProvider] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const getProvider = async () => {
      const resolvedParams = await params;
      setProvider(resolvedParams.provider);
    };
    getProvider();
  }, [params]);

  useEffect(() => {
    if (!provider) return;

    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const error = searchParams.get('error');

        if (error) {
          throw new Error(error);
        }

        if (!code) {
          throw new Error('Authorization code not found');
        }

        // In a real app, this would call the OAuth callback API
        // For now, simulate success
        await new Promise(resolve => setTimeout(resolve, 2000));

        setStatus('success');

        // Redirect to dashboard after successful authentication
        setTimeout(() => {
          router.push('/dashboard');
        }, 1000);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [provider, searchParams, router]);

  const getProviderName = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'google':
        return 'Google';
      case 'github':
        return 'GitHub';
      case 'microsoft':
        return 'Microsoft';
      case 'apple':
        return 'Apple';
      default:
        return provider;
    }
  };

  return (
    <div className="text-center mb-8">
      <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        {status === 'loading' && (
          <div>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Completing sign in...</h1>
            <p className="text-gray-600">
              Please wait while we complete your {getProviderName(provider)} authentication.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Success!</h1>
            <p className="text-gray-600">
              You've been successfully signed in with {getProviderName(provider)}. Redirecting to
              your dashboard...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Authentication Failed</h1>
            <p className="text-gray-600 mb-4">
              There was an error signing you in with {getProviderName(provider)}.
            </p>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <button
              onClick={() => router.push('/auth/login')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CallbackPage({ params }: CallbackPageProps) {
  return (
    <Suspense
      fallback={
        <div className="text-center mb-8">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Loading...</h1>
            <p className="text-gray-600">Please wait...</p>
          </div>
        </div>
      }
    >
      <CallbackContent params={params} />
    </Suspense>
  );
}
