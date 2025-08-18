'use client';

import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface UserSession {
  id: string;
  deviceInfo: {
    name: string;
    type: 'desktop' | 'mobile' | 'tablet';
    browser: string;
    os: string;
  };
  location: {
    city: string;
    country: string;
    ip: string;
  };
  isActive: boolean;
  isCurrent: boolean;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
}

interface SessionManagementProps {
  sessions: UserSession[];
  onTerminateSession: (sessionId: string) => Promise<void>;
  onTerminateAllSessions: () => Promise<void>;
}

export function SessionManagement({
  sessions,
  onTerminateSession,
  onTerminateAllSessions,
}: SessionManagementProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleTerminateSession = async (sessionId: string) => {
    setIsLoading(sessionId);
    try {
      await onTerminateSession(sessionId);
    } catch (error) {
      console.error('Failed to terminate session:', error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleTerminateAllSessions = async () => {
    setIsLoading('all');
    try {
      await onTerminateAllSessions();
    } catch (error) {
      console.error('Failed to terminate all sessions:', error);
    } finally {
      setIsLoading(null);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 18h.01M8 21h8a1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v16a1 1 0 001 1z"
            />
          </svg>
        );
      case 'tablet':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        );
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hours ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} days ago`;

    return date.toLocaleDateString();
  };

  const activeSessions = sessions.filter(session => session.isActive);
  const inactiveSessions = sessions.filter(session => !session.isActive);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Active Sessions</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage your active login sessions across all devices
          </p>
        </div>
        {activeSessions.length > 1 && (
          <Button
            variant="outline"
            onClick={handleTerminateAllSessions}
            disabled={isLoading === 'all'}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            {isLoading === 'all' ? 'Terminating...' : 'Terminate All Other Sessions'}
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {activeSessions.map(session => (
          <div
            key={session.id}
            className={`p-4 border rounded-lg ${
              session.isCurrent
                ? 'border-green-200 bg-green-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    session.isCurrent ? 'bg-green-100' : 'bg-gray-100'
                  }`}
                >
                  <div className={session.isCurrent ? 'text-green-600' : 'text-gray-600'}>
                    {getDeviceIcon(session.deviceInfo.type)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900 truncate">
                      {session.deviceInfo.name}
                    </h3>
                    {session.isCurrent && (
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                        Current Session
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-sm text-gray-600">
                    <p>
                      {session.deviceInfo.browser} on {session.deviceInfo.os}
                    </p>
                    <p>
                      {session.location.city}, {session.location.country} • {session.location.ip}
                    </p>
                    <p>
                      Started: {session.createdAt.toLocaleDateString()} at{' '}
                      {session.createdAt.toLocaleTimeString()}
                    </p>
                    <p>Last active: {formatTimeAgo(session.lastAccessedAt)}</p>
                    <p className="text-xs text-gray-500">
                      Expires: {session.expiresAt.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {!session.isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTerminateSession(session.id)}
                  disabled={isLoading === session.id}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-4"
                >
                  {isLoading === session.id ? 'Terminating...' : 'Terminate'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {inactiveSessions.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Sessions</h3>
          <div className="space-y-3">
            {inactiveSessions.slice(0, 5).map(session => (
              <div key={session.id} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center">
                    <div className="text-gray-500 text-sm">
                      {getDeviceIcon(session.deviceInfo.type)}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-700 truncate">
                        {session.deviceInfo.name}
                      </p>
                      <span className="text-xs text-gray-500">Ended</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {session.location.city}, {session.location.country} •{' '}
                      {formatTimeAgo(session.lastAccessedAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSessions.length === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Sessions</h3>
          <p className="text-gray-600">You don't have any active sessions at the moment.</p>
        </div>
      )}
    </div>
  );
}
