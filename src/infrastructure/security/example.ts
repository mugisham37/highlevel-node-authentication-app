/**
 * Cryptographic Services Example
 * Demonstrates the usage of all cryptographic services
 */

import { CryptographicService } from './cryptographic.service';

async function demonstrateCryptographicServices() {
  console.log('🔐 Cryptographic Services Demonstration\n');

  // Initialize the service with secure configuration
  const config = CryptographicService.generateSecureConfig();
  const cryptoService = new CryptographicService({
    ...config,
    riskScoringEnabled: true,
    deviceFingerprintingEnabled: true,
  });

  console.log('✅ Service initialized with secure configuration');

  // 1. Password Operations
  console.log('\n📝 Password Operations:');
  const password = 'SecurePassword123!@#';
  const hashedPassword = await cryptoService.hashPassword(password);
  console.log(`Original: ${password}`);
  console.log(`Hashed: ${hashedPassword.substring(0, 50)}...`);

  const isValid = await cryptoService.verifyPassword(password, hashedPassword);
  console.log(`Verification: ${isValid ? '✅ Valid' : '❌ Invalid'}`);

  const strength = cryptoService.validatePasswordStrength(password);
  console.log(`Strength: ${strength.level} (${strength.score}/100)`);

  // 2. JWT Token Operations
  console.log('\n🎫 JWT Token Operations:');
  const userPayload = {
    sub: cryptoService.generateUserId(),
    email: 'user@example.com',
    sessionId: cryptoService.generateSessionId(),
    deviceId: cryptoService.generateDeviceId(),
  };

  const tokenPair = cryptoService.createTokenPair(userPayload);
  console.log(`Access Token: ${tokenPair.accessToken.substring(0, 50)}...`);
  console.log(`Refresh Token: ${tokenPair.refreshToken.substring(0, 50)}...`);
  console.log(`Expires In: ${tokenPair.expiresIn} seconds`);

  const verification = cryptoService.verifyAccessToken(tokenPair.accessToken);
  console.log(`Token Valid: ${verification.valid ? '✅' : '❌'}`);

  // 3. Secure ID Generation
  console.log('\n🆔 Secure ID Generation:');
  console.log(`User ID: ${cryptoService.generateUserId()}`);
  console.log(`Session ID: ${cryptoService.generateSessionId()}`);
  console.log(`API Key: ${cryptoService.generateApiKey()}`);
  console.log(`Correlation ID: ${cryptoService.generateCorrelationId()}`);

  // 4. Token Generation
  console.log('\n🎲 Token Generation:');
  console.log(`Password Reset: ${cryptoService.generatePasswordResetToken()}`);
  console.log(
    `Email Verification: ${cryptoService.generateEmailVerificationToken()}`
  );
  console.log(`CSRF Token: ${cryptoService.generateCSRFToken()}`);
  console.log(`OTP: ${cryptoService.generateOTP(6)}`);

  const backupCodes = cryptoService.generateBackupCodes(3);
  console.log(`Backup Codes: ${backupCodes.join(', ')}`);

  // 5. PKCE Operations
  console.log('\n🔄 PKCE Operations:');
  const codeVerifier = cryptoService.generatePKCECodeVerifier();
  const codeChallenge = cryptoService.generatePKCECodeChallenge(codeVerifier);
  console.log(`Code Verifier: ${codeVerifier.substring(0, 30)}...`);
  console.log(`Code Challenge: ${codeChallenge}`);

  // 6. Device Fingerprinting
  console.log('\n👆 Device Fingerprinting:');
  const deviceInput = {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    ipAddress: '192.168.1.100',
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/New_York',
    screenResolution: '1920x1080',
    colorDepth: 24,
  };

  const deviceAnalysis = cryptoService.analyzeDevice(deviceInput);
  console.log(`Device ID: ${deviceAnalysis.fingerprint.id}`);
  console.log(`Device Type: ${deviceAnalysis.deviceType}`);
  console.log(`Trust Score: ${deviceAnalysis.trustScore}/100`);
  console.log(`Is Bot: ${deviceAnalysis.isBot ? '🤖' : '👤'}`);
  console.log(
    `Browser: ${deviceAnalysis.browserFamily} ${deviceAnalysis.browserVersion}`
  );
  console.log(`OS: ${deviceAnalysis.osFamily} ${deviceAnalysis.osVersion}`);

  // 7. Security Context and Risk Assessment
  console.log('\n⚠️ Risk Assessment:');
  const securityContext = cryptoService.createSecurityContext({
    userId: userPayload.sub,
    sessionId: userPayload.sessionId,
    ipAddress: deviceInput.ipAddress,
    userAgent: deviceInput.userAgent,
    accountAge: 30, // 30 days old account
    failedAttempts: 0,
    previousLogins: [
      {
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        success: true,
        ipAddress: '192.168.1.100',
        deviceFingerprint: deviceAnalysis.fingerprint.id,
        riskScore: 10,
      },
    ],
  });

  const riskAssessment = await cryptoService.assessRisk(securityContext);
  console.log(`Risk Score: ${riskAssessment.overallScore}/100`);
  console.log(`Risk Level: ${riskAssessment.level}`);
  console.log(`Requires MFA: ${riskAssessment.requiresMFA ? '✅' : '❌'}`);
  console.log(`Allow Access: ${riskAssessment.allowAccess ? '✅' : '❌'}`);
  console.log(`Risk Factors: ${riskAssessment.factors.length}`);

  if (riskAssessment.factors.length > 0) {
    console.log('Risk Factors:');
    riskAssessment.factors.forEach((factor, index) => {
      console.log(`  ${index + 1}. ${factor.description} (${factor.severity})`);
    });
  }

  // 8. Comprehensive Security Assessment
  console.log('\n🛡️ Comprehensive Security Assessment:');
  const securityAssessment =
    await cryptoService.performSecurityAssessment(securityContext);
  console.log(`Security Score: ${securityAssessment.securityScore}/100`);
  console.log(`Allow Access: ${securityAssessment.allowAccess ? '✅' : '❌'}`);
  console.log(`Requires MFA: ${securityAssessment.requiresMFA ? '✅' : '❌'}`);
  console.log(`Recommendations: ${securityAssessment.recommendations.length}`);

  // 9. Service Health
  console.log('\n💚 Service Health:');
  const health = cryptoService.getHealthStatus();
  console.log(`Status: ${health.status}`);
  console.log('Services:');
  Object.entries(health.services).forEach(([service, enabled]) => {
    console.log(`  ${service}: ${enabled ? '✅' : '❌'}`);
  });

  console.log('\n🎉 Demonstration completed successfully!');
}

// Run the demonstration
if (require.main === module) {
  demonstrateCryptographicServices().catch(console.error);
}

export { demonstrateCryptographicServices };
