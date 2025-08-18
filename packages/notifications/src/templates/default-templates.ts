/**
 * Default email templates for common authentication scenarios
 */

import { EmailTemplate } from '../email/interfaces';

export const defaultTemplates: EmailTemplate[] = [
  {
    id: 'welcome',
    name: 'Welcome Email',
    subject: 'Welcome to {{appName}}, {{firstName}}!',
    htmlTemplate: `
      <mjml>
        <mj-head>
          <mj-title>Welcome to {{appName}}</mj-title>
          <mj-preview>Welcome to {{appName}}, {{firstName}}!</mj-preview>
        </mj-head>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text font-size="20px" color="#F45E43" font-family="helvetica">
                Welcome to {{appName}}!
              </mj-text>
              <mj-text color="#555">
                Hi {{firstName}},
              </mj-text>
              <mj-text color="#555">
                Welcome to {{appName}}! We're excited to have you on board.
              </mj-text>
              <mj-text color="#555">
                Your account has been successfully created with the email address: {{email}}
              </mj-text>
              <mj-button background-color="#F45E43" color="white" href="{{loginUrl}}">
                Get Started
              </mj-button>
              <mj-text color="#555">
                If you have any questions, feel free to reach out to our support team.
              </mj-text>
              <mj-text color="#555">
                Best regards,<br>
                The {{appName}} Team
              </mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `,
    textTemplate: `
      Welcome to {{appName}}!
      
      Hi {{firstName}},
      
      Welcome to {{appName}}! We're excited to have you on board.
      
      Your account has been successfully created with the email address: {{email}}
      
      Get started by visiting: {{loginUrl}}
      
      If you have any questions, feel free to reach out to our support team.
      
      Best regards,
      The {{appName}} Team
    `,
    variables: ['appName', 'firstName', 'email', 'loginUrl'],
  },
  {
    id: 'email-verification',
    name: 'Email Verification',
    subject: 'Verify your email address for {{appName}}',
    htmlTemplate: `
      <mjml>
        <mj-head>
          <mj-title>Verify your email address</mj-title>
          <mj-preview>Please verify your email address to complete your registration</mj-preview>
        </mj-head>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text font-size="20px" color="#F45E43" font-family="helvetica">
                Verify your email address
              </mj-text>
              <mj-text color="#555">
                Hi {{firstName}},
              </mj-text>
              <mj-text color="#555">
                Please verify your email address to complete your registration for {{appName}}.
              </mj-text>
              <mj-button background-color="#F45E43" color="white" href="{{verificationUrl}}">
                Verify Email Address
              </mj-button>
              <mj-text color="#555">
                Or copy and paste this link into your browser:
              </mj-text>
              <mj-text color="#555">
                {{verificationUrl}}
              </mj-text>
              <mj-text color="#555">
                This verification link will expire in {{expirationHours}} hours.
              </mj-text>
              <mj-text color="#555">
                If you didn't create an account with {{appName}}, you can safely ignore this email.
              </mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `,
    textTemplate: `
      Verify your email address
      
      Hi {{firstName}},
      
      Please verify your email address to complete your registration for {{appName}}.
      
      Click here to verify: {{verificationUrl}}
      
      This verification link will expire in {{expirationHours}} hours.
      
      If you didn't create an account with {{appName}}, you can safely ignore this email.
    `,
    variables: ['firstName', 'appName', 'verificationUrl', 'expirationHours'],
  },
  {
    id: 'password-reset',
    name: 'Password Reset',
    subject: 'Reset your {{appName}} password',
    htmlTemplate: `
      <mjml>
        <mj-head>
          <mj-title>Reset your password</mj-title>
          <mj-preview>Reset your password for {{appName}}</mj-preview>
        </mj-head>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text font-size="20px" color="#F45E43" font-family="helvetica">
                Reset your password
              </mj-text>
              <mj-text color="#555">
                Hi {{firstName}},
              </mj-text>
              <mj-text color="#555">
                We received a request to reset your password for your {{appName}} account.
              </mj-text>
              <mj-button background-color="#F45E43" color="white" href="{{resetUrl}}">
                Reset Password
              </mj-button>
              <mj-text color="#555">
                Or copy and paste this link into your browser:
              </mj-text>
              <mj-text color="#555">
                {{resetUrl}}
              </mj-text>
              <mj-text color="#555">
                This password reset link will expire in {{expirationHours}} hours.
              </mj-text>
              <mj-text color="#555">
                If you didn't request a password reset, you can safely ignore this email.
              </mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `,
    textTemplate: `
      Reset your password
      
      Hi {{firstName}},
      
      We received a request to reset your password for your {{appName}} account.
      
      Click here to reset: {{resetUrl}}
      
      This password reset link will expire in {{expirationHours}} hours.
      
      If you didn't request a password reset, you can safely ignore this email.
    `,
    variables: ['firstName', 'appName', 'resetUrl', 'expirationHours'],
  },
  {
    id: 'two-factor-code',
    name: 'Two-Factor Authentication Code',
    subject: 'Your {{appName}} verification code',
    htmlTemplate: `
      <mjml>
        <mj-head>
          <mj-title>Your verification code</mj-title>
          <mj-preview>Your verification code for {{appName}}</mj-preview>
        </mj-head>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text font-size="20px" color="#F45E43" font-family="helvetica">
                Your verification code
              </mj-text>
              <mj-text color="#555">
                Hi {{firstName}},
              </mj-text>
              <mj-text color="#555">
                Your verification code for {{appName}} is:
              </mj-text>
              <mj-text font-size="32px" font-weight="bold" color="#F45E43" align="center">
                {{verificationCode}}
              </mj-text>
              <mj-text color="#555">
                This code will expire in {{expirationMinutes}} minutes.
              </mj-text>
              <mj-text color="#555">
                If you didn't request this code, please ignore this email and consider changing your password.
              </mj-text>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `,
    textTemplate: `
      Your verification code
      
      Hi {{firstName}},
      
      Your verification code for {{appName}} is: {{verificationCode}}
      
      This code will expire in {{expirationMinutes}} minutes.
      
      If you didn't request this code, please ignore this email and consider changing your password.
    `,
    variables: ['firstName', 'appName', 'verificationCode', 'expirationMinutes'],
  },
  {
    id: 'security-alert',
    name: 'Security Alert',
    subject: 'Security alert for your {{appName}} account',
    htmlTemplate: `
      <mjml>
        <mj-head>
          <mj-title>Security Alert</mj-title>
          <mj-preview>Security alert for your {{appName}} account</mj-preview>
        </mj-head>
        <mj-body>
          <mj-section>
            <mj-column>
              <mj-text font-size="20px" color="#FF6B6B" font-family="helvetica">
                Security Alert
              </mj-text>
              <mj-text color="#555">
                Hi {{firstName}},
              </mj-text>
              <mj-text color="#555">
                We detected {{alertType}} on your {{appName}} account:
              </mj-text>
              <mj-text color="#555">
                <strong>Event:</strong> {{eventDescription}}<br>
                <strong>Time:</strong> {{formatDate timestamp 'long'}}<br>
                <strong>Location:</strong> {{location}}<br>
                <strong>Device:</strong> {{device}}
              </mj-text>
              <mj-text color="#555">
                If this was you, no action is needed. If you don't recognize this activity, please secure your account immediately.
              </mj-text>
              <mj-button background-color="#FF6B6B" color="white" href="{{securityUrl}}">
                Review Security Settings
              </mj-button>
            </mj-column>
          </mj-section>
        </mj-body>
      </mjml>
    `,
    textTemplate: `
      Security Alert
      
      Hi {{firstName}},
      
      We detected {{alertType}} on your {{appName}} account:
      
      Event: {{eventDescription}}
      Time: {{formatDate timestamp 'long'}}
      Location: {{location}}
      Device: {{device}}
      
      If this was you, no action is needed. If you don't recognize this activity, please secure your account immediately.
      
      Review your security settings: {{securityUrl}}
    `,
    variables: ['firstName', 'appName', 'alertType', 'eventDescription', 'timestamp', 'location', 'device', 'securityUrl'],
  },
];