'use client';

import { SessionManagement } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

// Mock data - in a real app, this would come from your API
const mockSessions = [
  {
    id: '1',
    deviceInfo: {
      name: 'MacBook Pro - Chrome',
      type: 'desktop' as const,
      browser: 'Chrome 120.0.6099.109',
      os: 'macOS 14.2',
    },
    location: {
      city: 'New York',
      country: 'United States',
      ip: '192.168.1.100',
    },
    isActive: true,
    isCurrent: true,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    lastAccessedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: '2',
    deviceInfo: {
      name: 'iPhone 15 - Safari',
      type: 'mobile' as const,
      browser: 'Safari 17.2',
      os: 'iOS 17.2',
    },
    location: {
      city: 'New York',
      country: 'United States',
      ip: '192.168.1.101',
    },
    isActive: true,
    isCurrent: false,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    lastAccessedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    deviceInfo: {
      name: 'iPad Air - Safari',
      type: 'tablet' as const,
      browser: 'Safari 17.2',
      os: 'iPadOS 17.2',
    },
    location: {
      city: 'Boston',
      country: 'United States',
      ip: '10.0.1.50',
    },
    isActive: true,
    isCurrent: false,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    lastAccessedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: '4',
    deviceInfo: {
      name: 'Windows PC - Edge',
      type: 'desktop' as const,
      browser: 'Edge 120.0.2210.77',
      os: 'Windows 11',
    },
    location: {
      city: 'San Francisco',
      country: 'United States',
      ip: '203.0.113.45',
    },
    isActive: false,
    isCurrent: false,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    lastAccessedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    id: '5',
    deviceInfo: {
      name: 'Android Phone - Chrome',
      type: 'mobile' as const,
      browser: 'Chrome 120.0.6099.43',
      os: 'Android 14',
    },
    location: {
      city: 'Los Angeles',
      country: 'United States',
      ip: '198.51.100.23',
    },
    isActive: false,
    isCurrent: false,
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    lastAccessedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
];

export default function SessionsPage() {
  const [sessions, setSessions] = useState(mockSessions);

  const handleTerminateSession = async (sessionId: string) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));

      setSessions(prev =>
        prev.map(session =>
          session.id === sessionId
            ? { ...session, isActive: false, lastAccessedAt: new Date() }
            : session
        )
      );

      console.log(`Session ${sessionId} terminated`);
    } catch (error) {
      console.error('Failed to terminate session:', error);
      throw error;
    }
  };

  const handleTerminateAllSessions = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setSessions(prev =>
        prev.map(session =>
          session.isCurrent ? session : { ...session, isActive: false, lastAccessedAt: new Date() }
        )
      );

      console.log('All other sessions terminated');
    } catch (error) {
      console.error('Failed to terminate all sessions:', error);
      throw error;
    }
  };

  const activeSessions = sessions.filter(session => session.isActive);
  const totalSessions = sessions.length;

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
            <h1 className="text-3xl font-bold text-gray-900">Session Management</h1>
            <p className="text-gray-600 mt-2">
              Monitor and manage your active login sessions across all devices.
            </p>
          </div>

          {/* Session Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Sessions</p>
                  <p className="text-2xl font-bold text-gray-900">{activeSessions.length}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
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
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Sessions</p>
                  <p className="text-2xl font-bold text-gray-900">{totalSessions}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
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
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Current Device</p>
                  <p className="text-lg font-bold text-gray-900">MacBook Pro</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-purple-600"
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
              </div>
            </div>
          </div>

          {/* Session Management Component */}
          <SessionManagement
            sessions={sessions}
            onTerminateSession={handleTerminateSession}
            onTerminateAllSessions={handleTerminateAllSessions}
          />

          {/* Security Tips */}
          <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Security Tips</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
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
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Regular Reviews</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Check your active sessions regularly and terminate any you don't recognize.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
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
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Secure Networks</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Always log in from secure, trusted networks. Avoid public Wi-Fi for sensitive
                    activities.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
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
                  <h3 className="font-medium text-gray-900">Suspicious Activity</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    If you notice any suspicious sessions or locations, terminate them immediately
                    and change your password.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-4 h-4 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Always Log Out</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Remember to log out when using shared or public computers to prevent
                    unauthorized access.
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
