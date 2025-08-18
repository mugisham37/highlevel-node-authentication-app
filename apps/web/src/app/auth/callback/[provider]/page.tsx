'use client';

import { trpc } from '@/lib/trpc';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface CallbackPageProps {
  params: {
    provider: 'google' | 'github' | 'microsoft';
  };
}

export default function CallbackPage({ params }: CallbackPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  const oauthCallbackMutation = trpc.auth.oauthCallback.useMutation({
    onSuccess: data => {
      if (data.success) {
        // Store tokens in localStorage (in production, consider more secure storage)
        localStorage.setItem('auth-token', data.data.tokens.accessToken);
        localStorage.setItem('refresh-token', data.data.tokens.refreshToken);

        // Redirect to dashboard
        router.push('/dashboard');
      }
    },
    onError: error => {
      console.error('OAuth callback failed:', error);
      setError(error.message || 'Authentication failed');
      setIsProcessing(false);
    },
  });

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const storedState = sessionStorage.getItem('oauth_state');

    // Handle OAuth errors
    if (error) {
      setError(`OAuth error: ${error}`);
      setIsProcessing(false);
      return;
    }

    // Validate required parameters
    if (!code) {
      setError('Missing authorization code');
      setIsProcessing(false);
      return;
    }

    // Validate state parameter for security
    if (state !== storedState) {
      setError('Invalid state parameter');
      setIsProcessing(false);
      return;
    }

    // Clean up stored state
    sessionStorage.removeItem('oauth_state');

    // Process the OAuth callback
    oauthCallbackMutation.mutate({
      provider: params.provider,
      code,
      state: state || undefined,
    });
  }, [searchParams, params.provider, oauthCallbackMutation]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
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
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Failed</h2>
              <p className="text-gray-600 mb-4">{error}</p>
              <button
                onClick={() => router.push('/auth/login')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
              <svg
                className="animate-spin w-6 h-6 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Completing Authentication</h2>
            <p className="text-gray-600">Please wait while we sign you in...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
