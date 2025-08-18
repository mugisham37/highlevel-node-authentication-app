'use client';

import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { PasswordResetInput, PasswordResetRequestInput } from '@company/api-contracts';
import { passwordResetRequestSchema, passwordResetSchema } from '@company/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface PasswordResetFormProps {
  className?: string;
}

function PasswordResetFormContent({ className }: PasswordResetFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [emailSent, setEmailSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form for requesting password reset
  const {
    register: registerRequest,
    handleSubmit: handleSubmitRequest,
    formState: { errors: errorsRequest, isSubmitting: isSubmittingRequest },
    setError: setErrorRequest,
  } = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: {
      email: '',
    },
  });

  // Form for resetting password with token
  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    formState: { errors: errorsReset, isSubmitting: isSubmittingReset },
    setError: setErrorReset,
    watch,
  } = useForm<PasswordResetInput>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      token: token || '',
      password: '',
    },
  });

  const requestResetMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: data => {
      if (data.success) {
        setEmailSent(true);
      }
    },
    onError: error => {
      if (error.data?.code === 'NOT_FOUND') {
        setErrorRequest('email', { message: 'No account found with this email address' });
      } else if (error.data?.code === 'TOO_MANY_REQUESTS') {
        setErrorRequest('root', { message: 'Too many reset requests. Please try again later.' });
      } else {
        setErrorRequest('root', {
          message: error.message || 'Failed to send reset email. Please try again.',
        });
      }
    },
  });

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: data => {
      if (data.success) {
        setResetSuccess(true);
      }
    },
    onError: error => {
      console.error('Password reset error:', error);
      setErrorReset('root', {
        message: error.message || 'Failed to reset password. Please try again.',
      });
    },
  });

  const onSubmitRequest = async (data: PasswordResetRequestInput) => {
    try {
      await requestResetMutation.mutateAsync(data);
    } catch (error) {
      // Error handling is done in the mutation's onError callback
    }
  };

  const onSubmitReset = async (data: PasswordResetInput) => {
    try {
      await resetPasswordMutation.mutateAsync(data);
    } catch (error) {
      // Error handling is done in the mutation's onError callback
    }
  };

  // Success state for password reset completion
  if (resetSuccess) {
    return (
      <div className={cn('w-full max-w-md space-y-6 text-center', className)}>
        <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
          <div className="w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Password Reset Successful!</h2>
          <p className="text-gray-600 mb-4">
            Your password has been successfully reset. You can now sign in with your new password.
          </p>
          <Button onClick={() => router.push('/auth/login')} className="w-full">
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  // Success state for email sent
  if (emailSent && !token) {
    return (
      <div className={cn('w-full max-w-md space-y-6 text-center', className)}>
        <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Check Your Email</h2>
          <p className="text-gray-600 mb-4">
            We've sent a password reset link to your email address. Please check your inbox and
            click the link to reset your password.
          </p>
          <div className="space-y-3">
            <Button onClick={() => setEmailSent(false)} variant="outline" className="w-full">
              Send Another Email
            </Button>
            <Link
              href="/auth/login"
              className="block text-sm text-primary-600 hover:text-primary-500"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Password reset form (with token)
  if (token) {
    const password = watch('password');

    return (
      <div className={cn('w-full max-w-md space-y-6', className)}>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Reset Your Password</h1>
          <p className="mt-2 text-sm text-gray-600">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmitReset(onSubmitReset)} className="space-y-4">
          {errorsReset.root && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {errorsReset.root.message}
            </div>
          )}

          <input type="hidden" {...registerReset('token')} />

          <div>
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...registerReset('password')}
                error={errorsReset.password?.message}
                placeholder="Enter your new password"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>

            {/* Password strength indicator */}
            {password && (
              <div className="mt-2">
                <div className="text-xs text-gray-600 mb-1">Password strength:</div>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4].map(level => (
                    <div
                      key={level}
                      className={cn(
                        'h-1 flex-1 rounded',
                        getPasswordStrength(password) >= level
                          ? getPasswordStrength(password) === 1
                            ? 'bg-red-400'
                            : getPasswordStrength(password) === 2
                              ? 'bg-yellow-400'
                              : getPasswordStrength(password) === 3
                                ? 'bg-blue-400'
                                : 'bg-green-400'
                          : 'bg-gray-200'
                      )}
                    />
                  ))}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {getPasswordStrength(password) === 1 && 'Weak'}
                  {getPasswordStrength(password) === 2 && 'Fair'}
                  {getPasswordStrength(password) === 3 && 'Good'}
                  {getPasswordStrength(password) === 4 && 'Strong'}
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={isSubmittingReset || resetPasswordMutation.isPending}
            disabled={isSubmittingReset || resetPasswordMutation.isPending}
          >
            Reset Password
          </Button>
        </form>

        <div className="text-center">
          <Link href="/auth/login" className="text-sm text-primary-600 hover:text-primary-500">
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Request password reset form
  return (
    <div className={cn('w-full max-w-md space-y-6', className)}>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Forgot Your Password?</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={handleSubmitRequest(onSubmitRequest)} className="space-y-4">
        {errorsRequest.root && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {errorsRequest.root.message}
          </div>
        )}

        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...registerRequest('email')}
            error={errorsRequest.email?.message}
            placeholder="Enter your email address"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          loading={isSubmittingRequest || requestResetMutation.isPending}
          disabled={isSubmittingRequest || requestResetMutation.isPending}
        >
          Send Reset Link
        </Button>
      </form>

      <div className="text-center">
        <Link href="/auth/login" className="text-sm text-primary-600 hover:text-primary-500">
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}

// Password strength calculation
function getPasswordStrength(password: string): number {
  let strength = 0;

  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[@$!%*?&]/.test(password)) strength++;

  return Math.min(strength, 4);
}
export function PasswordResetForm({ className }: PasswordResetFormProps) {
  return (
    <Suspense
      fallback={
        <div className={cn('w-full max-w-md space-y-6', className)}>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto mb-8"></div>
            <div className="space-y-4">
              <div className="h-10 bg-gray-200 rounded"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      }
    >
      <PasswordResetFormContent className={className} />
    </Suspense>
  );
}
