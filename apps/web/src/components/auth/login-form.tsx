'use client';

import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { LoginInput } from '@company/api-contracts';
import { loginSchema } from '@company/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SocialAuthButtons } from './social-auth-buttons';

interface LoginFormProps {
  className?: string;
  onSuccess?: () => void;
  redirectTo?: string;
}

export function LoginForm({ className, onSuccess, redirectTo = '/dashboard' }: LoginFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: data => {
      if (data.success && data.data) {
        // Store tokens in localStorage (in production, consider more secure storage)
        localStorage.setItem('auth-token', data.data.tokens.accessToken);
        localStorage.setItem('refresh-token', data.data.tokens.refreshToken);

        onSuccess?.();
        router.push(redirectTo);
      }
    },
    onError: error => {
      if (error.data?.code === 'UNAUTHORIZED') {
        setError('root', { message: 'Invalid email or password' });
      } else if (error.data?.code === 'TOO_MANY_REQUESTS') {
        setError('root', { message: 'Too many login attempts. Please try again later.' });
      } else {
        setError('root', { message: error.message || 'Login failed. Please try again.' });
      }
    },
  });

  const onSubmit = async (data: LoginInput) => {
    try {
      // Add device fingerprint if available
      const deviceFingerprint = await generateDeviceFingerprint();
      await loginMutation.mutateAsync({
        ...data,
        deviceFingerprint,
      });
    } catch (error) {
      // Error handling is done in the mutation's onError callback
    }
  };

  return (
    <div className={cn('w-full max-w-md space-y-6', className)}>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Sign in to your account</h1>
        <p className="mt-2 text-sm text-gray-600">
          Don't have an account?{' '}
          <Link
            href="/auth/register"
            className="text-primary-600 hover:text-primary-500 font-medium"
          >
            Sign up
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {errors.root && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {errors.root.message}
          </div>
        )}

        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            error={errors.email?.message}
            placeholder="Enter your email"
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
              error={errors.password?.message}
              placeholder="Enter your password"
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
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Checkbox id="rememberMe" {...register('rememberMe')} />
            <Label htmlFor="rememberMe" className="ml-2 text-sm">
              Remember me
            </Label>
          </div>

          <Link
            href="/auth/forgot-password"
            className="text-sm text-primary-600 hover:text-primary-500"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          className="w-full"
          loading={isSubmitting || loginMutation.isPending}
          disabled={isSubmitting || loginMutation.isPending}
        >
          Sign in
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">Or continue with</span>
        </div>
      </div>

      <SocialAuthButtons />
    </div>
  );
}

// Simple device fingerprinting function
async function generateDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return '';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
  }

  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
  ].join('|');

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36);
}
