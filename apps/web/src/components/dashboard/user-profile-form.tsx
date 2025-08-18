'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

interface UserProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  timezone: string;
  locale: string;
}

interface UserProfileFormProps {
  initialData?: Partial<UserProfileData>;
  onSubmit: (data: UserProfileData) => Promise<void>;
  isLoading?: boolean;
}

export function UserProfileForm({ initialData, onSubmit, isLoading }: UserProfileFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<UserProfileData>({
    defaultValues: {
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      email: initialData?.email || '',
      phoneNumber: initialData?.phoneNumber || '',
      timezone: initialData?.timezone || 'UTC',
      locale: initialData?.locale || 'en',
    },
  });

  const handleFormSubmit = async (data: UserProfileData) => {
    try {
      await onSubmit(data);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  const handleCancel = () => {
    reset();
    setIsEditing(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Profile Information</h2>
          <p className="text-sm text-gray-600 mt-1">
            Update your personal information and contact details.
          </p>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit Profile
          </Button>
        )}
      </div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              {...register('firstName', { required: 'First name is required' })}
              disabled={!isEditing}
              className={!isEditing ? 'bg-gray-50' : ''}
            />
            {errors.firstName && (
              <p className="text-sm text-red-600 mt-1">{errors.firstName.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              {...register('lastName', { required: 'Last name is required' })}
              disabled={!isEditing}
              className={!isEditing ? 'bg-gray-50' : ''}
            />
            {errors.lastName && (
              <p className="text-sm text-red-600 mt-1">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid email address',
              },
            })}
            disabled={!isEditing}
            className={!isEditing ? 'bg-gray-50' : ''}
          />
          {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <Label htmlFor="phoneNumber">Phone Number</Label>
          <Input
            id="phoneNumber"
            type="tel"
            {...register('phoneNumber')}
            disabled={!isEditing}
            className={!isEditing ? 'bg-gray-50' : ''}
            placeholder="+1 (555) 123-4567"
          />
          {errors.phoneNumber && (
            <p className="text-sm text-red-600 mt-1">{errors.phoneNumber.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              {...register('timezone')}
              disabled={!isEditing}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                !isEditing ? 'bg-gray-50' : ''
              }`}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Chicago">Central Time</option>
              <option value="America/Denver">Mountain Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="Europe/London">London</option>
              <option value="Europe/Paris">Paris</option>
              <option value="Asia/Tokyo">Tokyo</option>
              <option value="Asia/Shanghai">Shanghai</option>
            </select>
          </div>

          <div>
            <Label htmlFor="locale">Language</Label>
            <select
              id="locale"
              {...register('locale')}
              disabled={!isEditing}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                !isEditing ? 'bg-gray-50' : ''
              }`}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="ja">Japanese</option>
              <option value="zh">Chinese</option>
            </select>
          </div>
        </div>

        {isEditing && (
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !isDirty}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
