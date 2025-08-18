import { describe, expect, it } from '@jest/globals';
import { updateUserPreferencesSchema, updateUserProfileSchema } from '../../schemas/user';

describe('User Schemas', () => {
  describe('Update User Profile Schema', () => {
    it('should validate correct profile data', () => {
      const validProfile = {
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
        timezone: 'America/New_York',
        locale: 'en-US',
      };

      const result = updateUserProfileSchema.safeParse(validProfile);
      expect(result.success).toBe(true);
    });

    it('should allow partial updates', () => {
      const partialProfile = {
        firstName: 'John',
      };

      const result = updateUserProfileSchema.safeParse(partialProfile);
      expect(result.success).toBe(true);
    });

    it('should reject invalid phone number', () => {
      const invalidProfile = {
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: 'invalid-phone',
      };

      const result = updateUserProfileSchema.safeParse(invalidProfile);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Invalid phone number');
      }
    });

    it('should reject empty first name', () => {
      const invalidProfile = {
        firstName: '',
        lastName: 'Doe',
      };

      const result = updateUserProfileSchema.safeParse(invalidProfile);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('First name is required');
      }
    });
  });

  describe('Update User Preferences Schema', () => {
    it('should validate correct preferences data', () => {
      const validPreferences = {
        theme: 'dark' as const,
        language: 'en',
        notifications: {
          email: true,
          push: false,
          sms: true,
        },
        privacy: {
          profileVisibility: 'private' as const,
          showOnlineStatus: false,
        },
      };

      const result = updateUserPreferencesSchema.safeParse(validPreferences);
      expect(result.success).toBe(true);
    });

    it('should allow partial preferences update', () => {
      const partialPreferences = {
        theme: 'light' as const,
        notifications: {
          email: false,
        },
      };

      const result = updateUserPreferencesSchema.safeParse(partialPreferences);
      expect(result.success).toBe(true);
    });

    it('should reject invalid theme', () => {
      const invalidPreferences = {
        theme: 'invalid-theme',
      };

      const result = updateUserPreferencesSchema.safeParse(invalidPreferences);
      expect(result.success).toBe(false);
    });

    it('should allow empty object', () => {
      const emptyPreferences = {};

      const result = updateUserPreferencesSchema.safeParse(emptyPreferences);
      expect(result.success).toBe(true);
    });
  });
});
