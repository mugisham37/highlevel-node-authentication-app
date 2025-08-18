'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

interface MfaMethod {
  id: string;
  type: 'totp' | 'sms' | 'email' | 'webauthn';
  name: string;
  isEnabled: boolean;
  isPrimary: boolean;
  lastUsed?: Date;
}

interface TrustedDevice {
  id: string;
  name: string;
  deviceType: string;
  browser: string;
  location: string;
  lastSeen: Date;
  isCurrent: boolean;
}

interface SecuritySettingsPanelProps {
  mfaMethods: MfaMethod[];
  trustedDevices: TrustedDevice[];
  onToggleMfa: (methodId: string, enabled: boolean) => Promise<void>;
  onSetPrimaryMfa: (methodId: string) => Promise<void>;
  onRemoveDevice: (deviceId: string) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export function SecuritySettingsPanel({
  mfaMethods,
  trustedDevices,
  onToggleMfa,
  onSetPrimaryMfa,
  onRemoveDevice,
  onChangePassword,
}: SecuritySettingsPanelProps) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await onChangePassword(passwordData.currentPassword, passwordData.newPassword);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordForm(false);
    } catch (error) {
      console.error('Failed to change password:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getMfaIcon = (type: string) => {
    switch (type) {
      case 'totp':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        );
      case 'sms':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        );
      case 'webauthn':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Password Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Password</h3>
            <p className="text-sm text-gray-600">Manage your account password</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowPasswordForm(!showPasswordForm)}
            className="flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            Change Password
          </Button>
        </div>

        {showPasswordForm && (
          <form onSubmit={handlePasswordChange} className="space-y-4 pt-4 border-t border-gray-200">
            <div>
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordData.currentPassword}
                onChange={e =>
                  setPasswordData({ ...passwordData, currentPassword: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                required
                minLength={8}
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={e =>
                  setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                }
                required
                minLength={8}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Updating...' : 'Update Password'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowPasswordForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Multi-Factor Authentication Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Multi-Factor Authentication</h3>
          <p className="text-sm text-gray-600 mt-1">
            Add an extra layer of security to your account
          </p>
        </div>

        <div className="space-y-4">
          {mfaMethods.map(method => (
            <div
              key={method.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="text-gray-600">{getMfaIcon(method.type)}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{method.name}</span>
                    {method.isPrimary && (
                      <span className="px-2 py-1 text-xs font-medium bg-primary-100 text-primary-800 rounded-full">
                        Primary
                      </span>
                    )}
                  </div>
                  {method.lastUsed && (
                    <p className="text-sm text-gray-600">
                      Last used: {method.lastUsed.toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {method.isEnabled && !method.isPrimary && (
                  <Button variant="outline" size="sm" onClick={() => onSetPrimaryMfa(method.id)}>
                    Set as Primary
                  </Button>
                )}
                <div className="flex items-center">
                  <Checkbox
                    id={`mfa-${method.id}`}
                    checked={method.isEnabled}
                    onCheckedChange={checked => onToggleMfa(method.id, checked as boolean)}
                  />
                  <Label htmlFor={`mfa-${method.id}`} className="ml-2">
                    {method.isEnabled ? 'Enabled' : 'Disabled'}
                  </Label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trusted Devices Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Trusted Devices</h3>
          <p className="text-sm text-gray-600 mt-1">
            Devices that you've marked as trusted for faster sign-in
          </p>
        </div>

        <div className="space-y-4">
          {trustedDevices.map(device => (
            <div
              key={device.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{device.name}</span>
                    {device.isCurrent && (
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                        Current Device
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {device.browser} • {device.location}
                  </p>
                  <p className="text-sm text-gray-500">
                    Last seen: {device.lastSeen.toLocaleDateString()}
                  </p>
                </div>
              </div>

              {!device.isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRemoveDevice(device.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
