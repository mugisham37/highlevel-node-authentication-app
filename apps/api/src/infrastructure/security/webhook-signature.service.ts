/**
 * Webhook Signature Service
 * Provides secure signature generation and verification for webhook payloads
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { IWebhookSignatureService } from '../../application/interfaces/webhook.interface';

export class WebhookSignatureService implements IWebhookSignatureService {
  private readonly algorithm = 'sha256';
  private readonly signaturePrefix = 'sha256=';

  /**
   * Generate HMAC signature for webhook payload
   */
  generateSignature(payload: string, secret: string): string {
    const hmac = createHmac(this.algorithm, secret);
    hmac.update(payload, 'utf8');
    const signature = hmac.digest('hex');
    return `${this.signaturePrefix}${signature}`;
  }

  /**
   * Verify webhook signature using timing-safe comparison
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    try {
      // Generate expected signature
      const expectedSignature = this.generateSignature(payload, secret);

      // Ensure both signatures have the same format
      if (
        !signature.startsWith(this.signaturePrefix) ||
        !expectedSignature.startsWith(this.signaturePrefix)
      ) {
        return false;
      }

      // Extract hex values for comparison
      const providedHex = signature.slice(this.signaturePrefix.length);
      const expectedHex = expectedSignature.slice(this.signaturePrefix.length);

      // Use timing-safe comparison to prevent timing attacks
      if (providedHex.length !== expectedHex.length) {
        return false;
      }

      const providedBuffer = Buffer.from(providedHex, 'hex');
      const expectedBuffer = Buffer.from(expectedHex, 'hex');

      return timingSafeEqual(providedBuffer, expectedBuffer);
    } catch (error) {
      // Log error but don't expose details
      console.error('Webhook signature verification error:', error);
      return false;
    }
  }

  /**
   * Generate cryptographically secure webhook secret
   */
  generateSecret(): string {
    // Generate 32 bytes (256 bits) of random data
    const secretBytes = randomBytes(32);
    return secretBytes.toString('base64');
  }

  /**
   * Validate webhook secret strength
   */
  validateSecret(secret: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!secret) {
      errors.push('Secret is required');
      return { valid: false, errors };
    }

    if (secret.length < 16) {
      errors.push('Secret must be at least 16 characters long');
    }

    if (secret.length > 256) {
      errors.push('Secret must not exceed 256 characters');
    }

    // Check for sufficient entropy (basic check)
    const uniqueChars = new Set(secret).size;
    if (uniqueChars < 8) {
      errors.push('Secret should contain more diverse characters');
    }

    // Check for common weak patterns
    if (/^(.)\1+$/.test(secret)) {
      errors.push('Secret should not consist of repeated characters');
    }

    if (/^(012|123|abc|password|secret)/i.test(secret)) {
      errors.push('Secret should not contain common patterns');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create signature headers for webhook delivery
   */
  createSignatureHeaders(
    payload: string,
    secret: string,
    timestamp?: number
  ): Record<string, string> {
    const currentTimestamp = timestamp || Math.floor(Date.now() / 1000);
    const signature = this.generateSignature(payload, secret);

    return {
      'X-Webhook-Signature': signature,
      'X-Webhook-Timestamp': currentTimestamp.toString(),
      'X-Webhook-Signature-256': signature, // Alternative header name for compatibility
    };
  }

  /**
   * Verify signature with timestamp validation to prevent replay attacks
   */
  verifySignatureWithTimestamp(
    payload: string,
    signature: string,
    secret: string,
    timestamp: string,
    toleranceSeconds: number = 300 // 5 minutes
  ): {
    valid: boolean;
    error?: string;
  } {
    try {
      // Verify timestamp is valid
      const webhookTimestamp = parseInt(timestamp, 10);
      if (isNaN(webhookTimestamp)) {
        return { valid: false, error: 'Invalid timestamp format' };
      }

      // Check if timestamp is within tolerance
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const timeDifference = Math.abs(currentTimestamp - webhookTimestamp);

      if (timeDifference > toleranceSeconds) {
        return { valid: false, error: 'Timestamp outside tolerance window' };
      }

      // Verify signature
      const signatureValid = this.verifySignature(payload, signature, secret);
      if (!signatureValid) {
        return { valid: false, error: 'Invalid signature' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'Signature verification failed',
      };
    }
  }

  /**
   * Generate test payload for webhook testing
   */
  generateTestPayload(eventType: string): Record<string, any> {
    return {
      id: `test_${randomBytes(8).toString('hex')}`,
      type: eventType,
      data: {
        message: 'This is a test webhook delivery',
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      metadata: {
        test: true,
        source: 'webhook_test',
      },
    };
  }

  /**
   * Create webhook delivery headers with all security headers
   */
  createDeliveryHeaders(
    payload: string,
    secret: string,
    customHeaders?: Record<string, string>
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureHeaders = this.createSignatureHeaders(
      payload,
      secret,
      timestamp
    );

    return {
      'Content-Type': 'application/json',
      'User-Agent': 'Enterprise-Auth-Webhook/1.0',
      'X-Webhook-Delivery': randomBytes(16).toString('hex'),
      ...signatureHeaders,
      ...customHeaders,
    };
  }
}
