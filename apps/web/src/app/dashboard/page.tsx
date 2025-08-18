'use client';

import { UserDashboard } from '@/components/dashboard';

// Mock data - in a real app, this would come from your API
const mockUser = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
};

const mockStats = {
  totalLogins: 1247,
  lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  activeSessions: 3,
  mfaEnabled: true,
  securityScore: 85,
};

const mockRecentActivity = [
  {
    id: '1',
    type: 'login' as const,
    title: 'Successful login',
    description: 'Logged in from Chrome on Windows',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '2',
    type: 'mfa_setup' as const,
    title: 'MFA method added',
    description: 'Added authenticator app as backup method',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    type: 'profile_update' as const,
    title: 'Profile updated',
    description: 'Updated phone number and timezone',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: '4',
    type: 'password_change' as const,
    title: 'Password changed',
    description: 'Successfully updated account password',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: '5',
    type: 'login' as const,
    title: 'Login from new device',
    description: 'Logged in from iPhone Safari',
    timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  },
];

const mockQuickActions = [
  {
    id: '1',
    title: 'Update Profile',
    description: 'Manage your personal information',
    icon: (
      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
        <svg
          className="w-5 h-5 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      </div>
    ),
    onClick: () => (window.location.href = '/dashboard/profile'),
  },
  {
    id: '2',
    title: 'Security Settings',
    description: 'Configure MFA and security options',
    icon: (
      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
        <svg
          className="w-5 h-5 text-green-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      </div>
    ),
    onClick: () => (window.location.href = '/dashboard/security'),
  },
  {
    id: '3',
    title: 'Active Sessions',
    description: 'View and manage your login sessions',
    icon: (
      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
        <svg
          className="w-5 h-5 text-purple-600"
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
    ),
    onClick: () => (window.location.href = '/dashboard/sessions'),
  },
  {
    id: '4',
    title: 'Change Password',
    description: 'Update your account password',
    icon: (
      <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
        <svg
          className="w-5 h-5 text-yellow-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
      </div>
    ),
    onClick: () => (window.location.href = '/dashboard/security'),
  },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <UserDashboard
            user={mockUser}
            stats={mockStats}
            recentActivity={mockRecentActivity}
            quickActions={mockQuickActions}
          />
        </div>
      </div>
    </div>
  );
}
