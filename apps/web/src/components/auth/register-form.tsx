'use client';

import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { RegisterInput } from '@company/api-contracts';
import { registerSchema } from '@company/api-contracts';
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

interface RegisterFormProps {
  className?: string;
  onSuccess?: () => void;
}

export function RegisterForm({ className, onSuccess }: RegisterFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    watch,
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      acceptTerms: false,
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: data => {
      if (data.success) {
        setRegistrationSuccess(true);
        onSuccess?.();
      }
    },
    onError: error => {
      if (error.data?.code === 'CONFLICT') {
        setError('email', { message: 'An account with this email already exists' });
      } else if (error.data?.code === 'VALIDATION_ERROR') {
        setError('root', { message: 'Please check your information and try again' });
      } else {
        setError('root', { message: error.message || 'Registration failed. Please try again.' });
      }
    },
  });

  const onSubmit = async (data: RegisterInput) => {
    try {
      await registerMutation.mutateAsync(data);
    } catch (error) {
      // Error handling is done in the mutation's onError callback
    }
  };

  if (registrationSuccess) {
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Account Created Successfully!
          </h2>
          <p className="text-gray-600 mb-4">
            We've sent a verification email to your address. Please check your inbox and click the
            verification link to activate your account.
          </p>
          <div className="space-y-3">
            <Button onClick={() => router.push('/auth/login')} className="w-full">
              Go to Sign In
            </Button>
            <Button
              variant="outline"
              onClick={() => setRegistrationSuccess(false)}
              className="w-full"
            >
              Register Another Account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const password = watch('password');

  return (
    <div className={cn('w-full max-w-md space-y-6', className)}>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
        <p className="mt-2 text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-primary-600 hover:text-primary-500 font-medium">
            Sign in
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {errors.root && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {errors.root.message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              {...register('firstName')}
              error={errors.firstName?.message}
              placeholder="John"
            />
          </div>

          <div>
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              {...register('lastName')}
              error={errors.lastName?.message}
              placeholder="Doe"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            error={errors.email?.message}
            placeholder="john.doe@example.com"
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              {...register('password')}
              error={errors.password?.message}
              placeholder="Create a strong password"
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

        <div className="flex items-start">
          <Checkbox id="acceptTerms" {...register('acceptTerms')} className="mt-1" />
          <Label htmlFor="acceptTerms" className="ml-2 text-sm leading-5">
            I agree to the{' '}
            <Link href="/terms" className="text-primary-600 hover:text-primary-500">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-primary-600 hover:text-primary-500">
              Privacy Policy
            </Link>
          </Label>
        </div>
        {errors.acceptTerms && <p className="text-sm text-red-600">{errors.acceptTerms.message}</p>}

        <Button
          type="submit"
          className="w-full"
          loading={isSubmitting || registerMutation.isPending}
          disabled={isSubmitting || registerMutation.isPending}
        >
          Create Account
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
