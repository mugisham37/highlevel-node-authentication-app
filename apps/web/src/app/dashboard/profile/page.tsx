'use client';

import { UserProfileForm } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

// Mock data - in a real app, this would come from your API
const mockUserData = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phoneNumber: '+1 (555) 123-4567',
  timezone: 'America/New_York',
  locale: 'en',
};

export default function ProfilePage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleProfileUpdate = async (data: any) => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Profile updated:', data);
      // In a real app, you would make an API call here
    } catch (error) {
      console.error('Failed to update profile:', error);
      throw error;
    } finally {
      setIsLoading(false);
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
            <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
            <p className="text-gray-600 mt-2">Manage your account information and preferences.</p>
          </div>

          {/* Profile Form */}
          <UserProfileForm
            initialData={mockUserData}
            onSubmit={handleProfileUpdate}
            isLoading={isLoading}
          />

          {/* Account Actions */}
          <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Actions</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div>
                  <h3 className="font-medium text-gray-900">Export Account Data</h3>
                  <p className="text-sm text-gray-600">
                    Download a copy of all your account data and activity.
                  </p>
                </div>
                <Button variant="outline">Export Data</Button>
              </div>

              <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
                <div>
                  <h3 className="font-medium text-red-900">Delete Account</h3>
                  <p className="text-sm text-red-600">
                    Permanently delete your account and all associated data.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-100"
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
