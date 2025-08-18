'use client';

import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { MfaVerificationInput } from '@company/api-contracts';
import { mfaVerificationSchema } from '@company/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface MfaVerificationFormProps {
  className?: string;
  method: 'totp' | 'sms' | 'email';
  onSuccess?: () => void;
  onCancel?: () => void;
  redirectTo?: string;
}

export function MfaVerificationForm({
  className,
  method,
  onSuccess,
  onCancel,
  redirectTo = '/dashboard',
}: MfaVerificationFormProps) {
  const router = useRouter();
  const [resendCooldown, setResendCooldown] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
  } = useForm<MfaVerificationInput>({
    resolver: zodResolver(mfaVerificationSchema),
    defaultValues: {
      code: '',
      method,
    },
  });

  const verifyMfaMutation = trpc.auth.verifyMfa.useMutation({
    onSuccess: data => {
      if (data.success) {
        onSuccess?.();
        router.push(redirectTo);
      }
    },
    onError: error => {
      if (error.data?.code === 'INVALID_CODE') {
        setError('code', { message: 'Invalid verification code. Please try again.' });
      } else if (error.data?.code === 'EXPIRED_CODE') {
        setError('code', { message: 'Verification code has expired. Please request a new one.' });
      } else if (error.data?.code === 'TOO_MANY_ATTEMPTS') {
        setError('root', { message: 'Too many failed attempts. Please try again later.' });
      } else {
        setError('root', { message: error.message || 'Verification failed. Please try again.' });
      }
    },
  });

  // For SMS and Email, we might want to allow resending codes
  const resendCodeMutation = trpc.auth.setupMfa.useMutation({
    onSuccess: () => {
      // Start cooldown timer
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    onError: error => {
      setError('root', { message: error.message || 'Failed to resend code. Please try again.' });
    },
  });

  const onSubmit = async (data: MfaVerificationInput) => {
    try {
      await verifyMfaMutation.mutateAsync(data);
    } catch (error) {
      // Error handling is done in the mutation's onError callback
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    try {
      await resendCodeMutation.mutateAsync({ method });
      reset({ code: '', method });
    } catch (error) {
      // Error handling is done in the mutation's onError callback
    }
  };

  const getMethodDescription = () => {
    switch (method) {
      case 'totp':
        return 'Enter the 6-digit code from your authenticator app';
      case 'sms':
        return 'Enter the 6-digit code sent to your phone';
      case 'email':
        return 'Enter the 6-digit code sent to your email';
      default:
        return 'Enter your verification code';
    }
  };

  const getMethodIcon = () => {
    switch (method) {
      case 'totp':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        );
      case 'sms':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        );
      case 'email':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={cn('w-full max-w-md space-y-6', className)}>
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center text-primary-600">
          {getMethodIcon()}
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Two-Factor Authentication</h2>
        <p className="mt-2 text-sm text-gray-600">{getMethodDescription()}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {errors.root && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {errors.root.message}
          </div>
        )}

        <div>
          <Label htmlFor="code">Verification Code</Label>
          <Input
            id="code"
            type="text"
            maxLength={6}
            {...register('code')}
            error={errors.code?.message}
            placeholder="000000"
            className="text-center text-lg tracking-widest font-mono"
            autoComplete="one-time-code"
            autoFocus
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          loading={isSubmitting || verifyMfaMutation.isPending}
          disabled={isSubmitting || verifyMfaMutation.isPending}
        >
          Verify Code
        </Button>

        {(method === 'sms' || method === 'email') && (
          <div className="text-center">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCooldown > 0 || resendCodeMutation.isPending}
              className="text-sm text-primary-600 hover:text-primary-500 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : resendCodeMutation.isPending
                  ? 'Sending...'
                  : 'Resend code'}
            </button>
          </div>
        )}

        <div className="text-center space-y-2">
          <p className="text-xs text-gray-500">
            Having trouble? Try using a backup code or contact support.
          </p>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-gray-600 hover:text-gray-500"
            >
              Cancel and sign out
            </button>
          )}
        </div>
      </form>

      {method === 'totp' && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800 mb-1">Tips:</h3>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• Make sure your device's time is synchronized</li>
            <li>• The code refreshes every 30 seconds</li>
            <li>• Use the most recent code from your app</li>
          </ul>
        </div>
      )}
    </div>
  );
}
