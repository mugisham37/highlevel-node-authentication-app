'use client';

import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { MfaSetupInput, MfaVerificationInput } from '@company/api-contracts';
import { mfaSetupSchema, mfaVerificationSchema } from '@company/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

interface MfaSetupFormProps {
  className?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

type SetupStep = 'method' | 'setup' | 'verify' | 'complete';

export function MfaSetupForm({ className, onSuccess, onCancel }: MfaSetupFormProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>('method');
  const [selectedMethod, setSelectedMethod] = useState<'totp' | 'sms' | 'email'>('totp');
  const [setupData, setSetupData] = useState<{
    secret?: string;
    qrCode?: string;
    backupCodes?: string[];
  }>({});

  // Form for method selection and phone number (if SMS)
  const {
    register: registerSetup,
    handleSubmit: handleSubmitSetup,
    formState: { errors: errorsSetup, isSubmitting: isSubmittingSetup },
    setError: setErrorSetup,
    watch,
  } = useForm<MfaSetupInput>({
    resolver: zodResolver(mfaSetupSchema),
    defaultValues: {
      method: 'totp',
      phoneNumber: '',
    },
  });

  // Form for MFA code verification
  const {
    register: registerVerify,
    handleSubmit: handleSubmitVerify,
    formState: { errors: errorsVerify, isSubmitting: isSubmittingVerify },
    setError: setErrorVerify,
    setValue: setValueVerify,
  } = useForm<MfaVerificationInput>({
    resolver: zodResolver(mfaVerificationSchema),
    defaultValues: {
      code: '',
      method: 'totp',
    },
  });

  const setupMfaMutation = trpc.auth.setupMfa.useMutation({
    onSuccess: data => {
      if (data.success) {
        setSetupData({
          secret: data.data.secret,
          qrCode: data.data.qrCode,
          backupCodes: data.data.backupCodes,
        });
        setCurrentStep('verify');
        setValueVerify('method', selectedMethod);
      }
    },
    onError: error => {
      if (error.data?.code === 'VALIDATION_ERROR') {
        setErrorSetup('root', { message: 'Please check your information and try again' });
      } else {
        setErrorSetup('root', {
          message: error.message || 'Failed to setup MFA. Please try again.',
        });
      }
    },
  });

  const verifyMfaMutation = trpc.auth.verifyMfa.useMutation({
    onSuccess: data => {
      if (data.success) {
        setCurrentStep('complete');
      }
    },
    onError: error => {
      if (error.data?.code === 'INVALID_CODE') {
        setErrorVerify('code', { message: 'Invalid verification code' });
      } else {
        setErrorVerify('root', {
          message: error.message || 'Verification failed. Please try again.',
        });
      }
    },
  });

  const onSubmitSetup = async (data: MfaSetupInput) => {
    try {
      setSelectedMethod(data.method);
      await setupMfaMutation.mutateAsync(data);
    } catch (error) {
      // Error handling is done in the mutation's onError callback
    }
  };

  const onSubmitVerify = async (data: MfaVerificationInput) => {
    try {
      await verifyMfaMutation.mutateAsync(data);
    } catch (error) {
      // Error handling is done in the mutation's onError callback
    }
  };

  const phoneNumber = watch('phoneNumber');

  // Completion step
  if (currentStep === 'complete') {
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">MFA Setup Complete!</h2>
          <p className="text-gray-600 mb-4">
            Multi-factor authentication has been successfully enabled for your account. Your account
            is now more secure.
          </p>

          {setupData.backupCodes && setupData.backupCodes.length > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left">
              <h3 className="font-medium text-yellow-800 mb-2">Backup Codes</h3>
              <p className="text-sm text-yellow-700 mb-3">
                Save these backup codes in a safe place. You can use them to access your account if
                you lose your authenticator device.
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {setupData.backupCodes.map((code, index) => (
                  <div key={index} className="bg-white p-2 rounded border text-center">
                    {code}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Button
              onClick={() => {
                onSuccess?.();
              }}
              className="w-full"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Verification step
  if (currentStep === 'verify') {
    return (
      <div className={cn('w-full max-w-md space-y-6', className)}>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Verify Your Setup</h2>
          <p className="mt-2 text-sm text-gray-600">
            {selectedMethod === 'totp' && 'Enter the 6-digit code from your authenticator app'}
            {selectedMethod === 'sms' && 'Enter the 6-digit code sent to your phone'}
            {selectedMethod === 'email' && 'Enter the 6-digit code sent to your email'}
          </p>
        </div>

        {selectedMethod === 'totp' && setupData.qrCode && (
          <div className="text-center space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-3">
                Scan this QR code with your authenticator app:
              </p>
              <div className="flex justify-center">
                <img src={setupData.qrCode} alt="QR Code for TOTP setup" className="w-48 h-48" />
              </div>
            </div>

            {setupData.secret && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700 mb-2">Or enter this secret key manually:</p>
                <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
                  {setupData.secret}
                </code>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmitVerify(onSubmitVerify)} className="space-y-4">
          {errorsVerify.root && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {errorsVerify.root.message}
            </div>
          )}

          <div>
            <Label htmlFor="code">Verification Code</Label>
            <Input
              id="code"
              type="text"
              maxLength={6}
              {...registerVerify('code')}
              error={errorsVerify.code?.message}
              placeholder="000000"
              className="text-center text-lg tracking-widest"
            />
          </div>

          <div className="flex space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep('method')}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1"
              loading={isSubmittingVerify || verifyMfaMutation.isPending}
              disabled={isSubmittingVerify || verifyMfaMutation.isPending}
            >
              Verify
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // Method selection and setup step
  return (
    <div className={cn('w-full max-w-md space-y-6', className)}>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Setup Multi-Factor Authentication</h2>
        <p className="mt-2 text-sm text-gray-600">
          Choose your preferred method for two-factor authentication
        </p>
      </div>

      <form onSubmit={handleSubmitSetup(onSubmitSetup)} className="space-y-6">
        {errorsSetup.root && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {errorsSetup.root.message}
          </div>
        )}

        <div>
          <Label>Authentication Method</Label>
          <RadioGroup
            value={watch('method')}
            onValueChange={value => registerSetup('method').onChange({ target: { value } })}
            className="mt-2"
          >
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
              <RadioGroupItem value="totp" id="totp" />
              <Label htmlFor="totp" className="flex-1 cursor-pointer">
                <div className="font-medium">Authenticator App</div>
                <div className="text-sm text-gray-500">
                  Use Google Authenticator, Authy, or similar apps
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
              <RadioGroupItem value="sms" id="sms" />
              <Label htmlFor="sms" className="flex-1 cursor-pointer">
                <div className="font-medium">SMS Text Message</div>
                <div className="text-sm text-gray-500">Receive codes via text message</div>
              </Label>
            </div>

            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
              <RadioGroupItem value="email" id="email" />
              <Label htmlFor="email" className="flex-1 cursor-pointer">
                <div className="font-medium">Email</div>
                <div className="text-sm text-gray-500">Receive codes via email</div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {watch('method') === 'sms' && (
          <div>
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              type="tel"
              {...registerSetup('phoneNumber')}
              error={errorsSetup.phoneNumber?.message}
              placeholder="+1 (555) 123-4567"
            />
          </div>
        )}

        <div className="flex space-x-3">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={isSubmittingSetup || setupMfaMutation.isPending}
            disabled={
              isSubmittingSetup ||
              setupMfaMutation.isPending ||
              (watch('method') === 'sms' && !phoneNumber)
            }
          >
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
