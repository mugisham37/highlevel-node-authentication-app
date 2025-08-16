/**
 * Email Value Object
 * Represents a validated email address with domain business rules
 */

export class Email {
  private readonly _value: string;

  constructor(value: string) {
    this.validate(value);
    this._value = value.toLowerCase().trim();
  }

  get value(): string {
    return this._value;
  }

  get domain(): string {
    const parts = this._value.split('@');
    return parts[1] || '';
  }

  get localPart(): string {
    const parts = this._value.split('@');
    return parts[0] || '';
  }

  private validate(email: string): void {
    if (!email || typeof email !== 'string') {
      throw new Error('Email must be a non-empty string');
    }

    const trimmed = email.trim();
    if (trimmed.length === 0) {
      throw new Error('Email cannot be empty');
    }

    if (trimmed.length > 254) {
      throw new Error('Email address too long (max 254 characters)');
    }

    // RFC 5322 compliant email regex
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!emailRegex.test(trimmed)) {
      throw new Error('Invalid email format');
    }

    // Additional business rules
    const emailParts = trimmed.split('@');
    if (emailParts.length !== 2) {
      throw new Error('Invalid email format');
    }
    
    const localPart = emailParts[0];
    if (!localPart || localPart.length > 64) {
      throw new Error('Email local part too long (max 64 characters)');
    }

    // Check for consecutive dots
    if (trimmed.includes('..')) {
      throw new Error('Email cannot contain consecutive dots');
    }

    // Check for leading/trailing dots in local part
    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      throw new Error('Email local part cannot start or end with a dot');
    }
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  toJSON(): string {
    return this._value;
  }

  /**
   * Check if email is from a disposable email provider
   */
  isDisposable(): boolean {
    const disposableDomains = [
      '10minutemail.com',
      'tempmail.org',
      'guerrillamail.com',
      'mailinator.com',
      'throwaway.email',
    ];

    return disposableDomains.includes(this.domain.toLowerCase());
  }

  /**
   * Check if email is from a corporate domain
   */
  isCorporate(): boolean {
    const personalDomains = [
      'gmail.com',
      'yahoo.com',
      'hotmail.com',
      'outlook.com',
      'aol.com',
      'icloud.com',
    ];

    return !personalDomains.includes(this.domain.toLowerCase());
  }
}
