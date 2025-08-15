/**
 * MFA System Usage Example
 * Demonstrates how to use the Multi-Factor Authentication system
 */

import { TOTPService } from '../infrastructure/security/totp.service';
import { SMSService } from '../infrastructure/security/sms.service';
import { EmailMFAService } from '../infrastructure/security/email-mfa.service';
import { WebAuthnService } from '../infrastructure/security/webauthn.service';
import { SecureTokenGenerator } from '../infrastructure/security/secure-token-generator.service';
import { Logger } from 'winston';

// Mock logger for example
const logger = {
  info: (message: string, meta?: any) =>
    console.log(`[INFO] ${message}`, meta || ''),
  error: (message: string, meta?: any) =>
    console.error(`[ERROR] ${message}`, meta || ''),
  warn: (message: string, meta?: any) =>
    console.warn(`[WARN] ${message}`, meta || ''),
  debug: (message: string, meta?: any) =>
    console.debug(`[DEBUG] ${message}`, meta || ''),
} as unknown as Logger;

async function demonstrateMFASystem() {
  console.log('🔐 Multi-Factor Authentication System Demo\n');

  // Initialize services (in a real app, these would be injected via DI)
  const totpService = new TOTPService(logger);

  const smsConfig = {
    accountSid: 'ACtest1234567890123456789012345678',
    authToken: 'test-token',
    fromNumber: '+1234567890',
    serviceName: 'Demo App',
  };
  const smsService = new SMSService(smsConfig, logger);

  const emailConfig = {
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'demo@example.com',
    smtpPassword: 'password',
    fromEmail: 'noreply@example.com',
    fromName: 'Demo App',
    serviceName: 'Demo App',
  };
  const emailService = new EmailMFAService(emailConfig, logger);

  const webAuthnConfig = {
    rpName: 'Demo App',
    rpID: 'localhost',
    origin: 'http://localhost:3000',
  };
  const webAuthnService = new WebAuthnService(webAuthnConfig, logger);

  // Mock repositories (in a real app, these would connect to actual databases)


  // 1. TOTP (Time-based One-Time Password) Demo
  console.log('1️⃣ TOTP (Time-based One-Time Password) Demo');
  console.log('='.repeat(50));

  try {
    // Generate TOTP secret
    const totpSetup = await totpService.generateSecret(
      'demo@example.com',
      'Demo App'
    );

    console.log('✅ TOTP Secret Generated:');
    console.log(`   Secret: ${totpSetup.secret}`);
    console.log(
      `   Manual Entry Key: ${totpService.formatManualEntryKey(totpSetup.secret)}`
    );
    console.log(`   QR Code Available: ${!!totpSetup.qrCodeUrl}`);

    // Generate current token
    const currentToken = totpService.generateCurrentToken(totpSetup.secret);
    console.log(`   Current Token: ${currentToken}`);

    // Verify the token
    const verification = await totpService.verifyToken(
      totpSetup.secret,
      currentToken
    );
    console.log(
      `   Verification Result: ${verification.valid ? '✅ Valid' : '❌ Invalid'}`
    );

    // Generate backup codes
    const backupCodes = totpService.generateBackupCodes(5);
    console.log(`   Backup Codes: ${backupCodes.join(', ')}`);

    // Get remaining time
    const remainingTime = totpService.getRemainingTime();
    console.log(`   Token expires in: ${remainingTime} seconds`);
  } catch (error) {
    console.error('❌ TOTP Demo failed:', error);
  }

  console.log('\n');

  // 2. SMS MFA Demo
  console.log('2️⃣ SMS MFA Demo');
  console.log('='.repeat(50));

  try {
    // Generate OTP code
    const smsCode = SecureTokenGenerator.generateOTP(6);
    console.log(`✅ SMS Code Generated: ${smsCode}`);

    // Validate phone number
    const phoneNumber = '+1234567890';
    const service = smsService as any;
    const isValidPhone = service.isValidPhoneNumber(phoneNumber);
    console.log(
      `   Phone ${phoneNumber} is ${isValidPhone ? 'valid' : 'invalid'}`
    );

    // Mask phone number for logging
    const maskedPhone = service.maskPhoneNumber(phoneNumber);
    console.log(`   Masked phone: ${maskedPhone}`);

    // Format MFA message
    const message = service.formatMFAMessage(smsCode, 5);
    console.log(`   SMS Message: "${message}"`);
  } catch (error) {
    console.error('❌ SMS Demo failed:', error);
  }

  console.log('\n');

  // 3. Email MFA Demo
  console.log('3️⃣ Email MFA Demo');
  console.log('='.repeat(50));

  try {
    // Generate email code
    const emailCode = SecureTokenGenerator.generateOTP(6);
    console.log(`✅ Email Code Generated: ${emailCode}`);

    // Validate email
    const email = 'demo@example.com';
    const emailSvc = emailService as any;
    const isValidEmail = emailSvc.isValidEmail(email);
    console.log(`   Email ${email} is ${isValidEmail ? 'valid' : 'invalid'}`);

    // Mask email for logging
    const maskedEmail = emailSvc.maskEmail(email);
    console.log(`   Masked email: ${maskedEmail}`);

    // Generate email template
    const template = emailSvc.getMFACodeTemplate(emailCode, 10);
    console.log(`   Email Subject: "${template.subject}"`);
    console.log(
      `   Email contains code: ${template.htmlBody.includes(emailCode)}`
    );
  } catch (error) {
    console.error('❌ Email Demo failed:', error);
  }

  console.log('\n');

  // 4. WebAuthn Demo
  console.log('4️⃣ WebAuthn Demo');
  console.log('='.repeat(50));

  try {
    const userId = 'demo-user-123';
    const credentialName = 'Demo YubiKey';

    // Register a credential (simplified)
    const registrationResult = await webAuthnService.registerCredential({
      userId,
      credentialName,
      challenge: 'demo-challenge',
      origin: 'http://localhost:3000',
    });

    console.log(
      `✅ WebAuthn Registration: ${registrationResult.success ? 'Success' : 'Failed'}`
    );
    if (registrationResult.success) {
      console.log(`   Credential ID: ${registrationResult.credentialId}`);
    }

    // Get user credentials
    const credentials = await webAuthnService.getUserCredentials(userId);
    console.log(`   User has ${credentials.length} credential(s)`);

    // Update credential name
    if (credentials.length > 0 && credentials[0]?.credentialId) {
      const updated = await webAuthnService.updateCredentialName(
        userId,
        credentials[0].credentialId,
        'Updated YubiKey Name'
      );
      console.log(
        `   Credential name updated: ${updated ? 'Success' : 'Failed'}`
      );
    }

    // Get service health
    const health = await webAuthnService?.getServiceHealth();
    console.log(
      `   Service Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`
    );
    console.log(`   Total Credentials: ${health.credentialsCount}`);
  } catch (error) {
    console.error('❌ WebAuthn Demo failed:', error);
  }

  console.log('\n');

  // 5. Secure Token Generator Demo
  console.log('5️⃣ Secure Token Generator Demo');
  console.log('='.repeat(50));

  try {
    // Generate various types of tokens
    const hexToken = SecureTokenGenerator.generateToken({
      length: 16,
      encoding: 'hex',
    });
    console.log(`✅ Hex Token: ${hexToken}`);

    const base64Token = SecureTokenGenerator.generateToken({
      length: 16,
      encoding: 'base64',
    });
    console.log(`   Base64 Token: ${base64Token}`);

    const customToken = SecureTokenGenerator.generateToken({
      length: 8,
      alphabet: 'ABCDEF123456',
      prefix: 'demo_',
      suffix: '_end',
    });
    console.log(`   Custom Token: ${customToken}`);

    // Generate timestamped token
    const timestamped = SecureTokenGenerator.generateTimestampedToken({
      length: 16,
      expiresIn: 300, // 5 minutes
    });
    console.log(`   Timestamped Token: ${timestamped.token}`);
    console.log(
      `   Expires At: ${new Date(timestamped.expiresAt!).toISOString()}`
    );

    // Generate signed token
    const secret = 'demo-secret';
    const payload = 'user123';
    const signedToken = SecureTokenGenerator.generateSignedToken(
      payload,
      secret
    );
    console.log(`   Signed Token: ${signedToken}`);

    // Verify signed token
    const verification = SecureTokenGenerator.verifySignedToken(
      signedToken,
      secret
    );
    console.log(
      `   Verification: ${verification.valid ? '✅ Valid' : '❌ Invalid'}`
    );
    console.log(`   Payload: ${verification.payload}`);

    // Generate device binding token
    const deviceId = 'device-123';
    const bindingToken = SecureTokenGenerator.generateDeviceBindingToken(
      deviceId,
      secret
    );
    console.log(`   Device Binding Token: ${bindingToken}`);

    // Verify device binding
    const deviceValid = SecureTokenGenerator.verifyDeviceBindingToken(
      bindingToken,
      deviceId,
      secret
    );
    console.log(
      `   Device Binding Valid: ${deviceValid ? '✅ Valid' : '❌ Invalid'}`
    );
  } catch (error) {
    console.error('❌ Token Generator Demo failed:', error);
  }

  console.log('\n');

  // 6. Risk-based MFA Demo
  console.log('6️⃣ Risk-based MFA Demo');
  console.log('='.repeat(50));

  try {
    // Simulate different risk scenarios
    const scenarios = [
      { riskScore: 20, description: 'Low risk - normal login' },
      { riskScore: 50, description: 'Medium risk - new device' },
      { riskScore: 80, description: 'High risk - suspicious location' },
    ];

    for (const scenario of scenarios) {
      // In a real implementation, this would check the user's MFA settings
      const requiresMFA = scenario.riskScore > 70 || scenario.riskScore > 50;
      console.log(`   ${scenario.description}:`);
      console.log(`     Risk Score: ${scenario.riskScore}`);
      console.log(`     Requires MFA: ${requiresMFA ? '✅ Yes' : '❌ No'}`);
    }
  } catch (error) {
    console.error('❌ Risk-based MFA Demo failed:', error);
  }

  console.log('\n🎉 MFA System Demo Complete!\n');
  console.log('Key Features Demonstrated:');
  console.log('• TOTP generation and verification');
  console.log('• SMS-based MFA with secure code generation');
  console.log('• Email-based MFA as fallback mechanism');
  console.log('• WebAuthn/FIDO2 support for hardware keys');
  console.log('• Risk-based MFA triggering');
  console.log('• Backup codes for MFA recovery');
  console.log('• Secure token generation utilities');
  console.log('• Comprehensive error handling and logging');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateMFASystem().catch(console.error);
}

export { demonstrateMFASystem };
