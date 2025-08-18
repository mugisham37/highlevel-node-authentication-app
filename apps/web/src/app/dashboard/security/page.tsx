'use client';

import { SecuritySettingsPanel } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

// Mock data - in a real app, this would come from your API
const mockMfaMethods = [
  {
    id: '1',
    type: 'totp' as const,
    name: 'Authenticator App',
    isEnabled: true,
    isPrimary: true,
    lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '2',
    type: 'sms' as const,
    name: 'SMS to +1 (555) ***-4567',
    isEnabled: true,
    isPrimary: false,
    lastUsed: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    type: 'email' as const,
    name: 'Email to j***@example.com',
    isEnabled: false,
    isPrimary: false,
  },
  {
    id: '4',
    type: 'webauthn' as const,
    name: 'Security Key',
    isEnabled: false,
    isPrimary: false,
  },
];

const mockTrustedDevices = [
  {
    id: '1',
    name: 'MacBook Pro',
    deviceType: 'desktop',
    browser: 'Chrome 120',
    location: 'New York, US',
    lastSeen: new Date(),
    isCurrent: true,
  },
  {
    id: '2',
    name: 'iPhone 15',
    deviceType: 'mobile',
    browser: 'Safari 17',
    location: 'New York, US',
    lastSeen: new Date(Date.now() - 1 * 60 * 60 * 1000),
    isCurrent: false,
  },
  {
    id: '3',
    name: 'iPad Air',
    deviceType: 'tablet',
    browser: 'Safari 17',
    location: 'New York, US',
    lastSeen: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    isCurrent: false,
  },
];

export default function SecurityPage() {
  const [mfaMethods, setMfaMethods] = useState(mockMfaMethods);
  const [trustedDevices, setTrustedDevices] = useState(mockTrustedDevices);

  const handleToggleMfa = async (methodId: string, enabled: boolean) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));

      setMfaMethods(prev =>
        prev.map(method => (method.id === methodId ? { ...method, isEnabled: enabled } : method))
      );

      console.log(`MFA method ${methodId} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to toggle MFA:', error);
      throw error;
    }
  };

  const handleSetPrimaryMfa = async (methodId: string) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));

      setMfaMethods(prev =>
        prev.map(method => ({
          ...method,
          isPrimary: method.id === methodId,
        }))
      );

      console.log(`MFA method ${methodId} set as primary`);
    } catch (error) {
      console.error('Failed to set primary MFA:', error);
      throw error;
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));

      setTrustedDevices(prev => prev.filter(device => device.id !== deviceId));

      console.log(`Device ${deviceId} removed`);
    } catch (error) {
      console.error('Failed to remove device:', error);
      throw error;
    }
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Password changed successfully', { currentPassword, newPassword });
    } catch (error) {
      console.error('Failed to change password:', error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Button
                variant="outline"
                onClick={() => window.history.back()}
                className="flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to Dashboard
              </Button>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Security Settings</h1>
            <p className="text-gray-600 mt-2">
              Manage your account security, multi-factor authentication, and trusted devices.
            </p>
          </div>

          {/* Security Settings Panel */}
          <SecuritySettingsPanel
            mfaMethods={mfaMethods}
            trustedDevices={trustedDevices}
            onToggleMfa={handleToggleMfa}
            onSetPrimaryMfa={handleSetPrimaryMfa}
            onRemoveDevice={handleRemoveDevice}
            onChangePassword={handleChangePassword}
          />

          {/* Security Recommendations */}
          <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Security Recommendations</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-4 h-4 text-green-600"
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
                <div>
                  <h3 className="font-medium text-green-900">
                    Multi-Factor Authentication Enabled
                  </h3>
                  <p className="text-sm text-green-700 mt-1">
                    Great! You have MFA enabled which significantly improves your account security.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-4 h-4 text-yellow-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-yellow-900">Consider Adding a Security Key</h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    Hardware security keys provide the highest level of protection against phishing
                    attacks.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-4 h-4 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-blue-900">Regular Security Checkups</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Review your trusted devices and active sessions regularly to ensure account
                    security.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
