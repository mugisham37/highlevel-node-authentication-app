/**
 * Security Compliance Routes
 * Routes for security compliance and standards implementation
 */

import { FastifyInstance } from 'fastify';
import { SecurityComplianceController } from '../controllers/security-compliance.controller';

const securityComplianceController = new SecurityComplianceController();

export async function securityComplianceRoutes(fastify: FastifyInstance) {
  // GDPR Compliance Routes
  fastify.post('/gdpr/consent', {
    schema: {
      description: 'Record GDPR consent',
      tags: ['GDPR', 'Compliance'],
      body: {
        type: 'object',
        required: ['subjectId', 'purpose', 'legalBasis', 'granted', 'version'],
        properties: {
          subjectId: { type: 'string' },
          purpose: { type: 'string' },
          legalBasis: {
            type: 'string',
            enum: [
              'consent',
              'contract',
              'legal_obligation',
              'vital_interests',
              'public_task',
              'legitimate_interests',
            ],
          },
          granted: { type: 'boolean' },
          version: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                subjectId: { type: 'string' },
                purpose: { type: 'string' },
                legalBasis: { type: 'string' },
                granted: { type: 'boolean' },
                timestamp: { type: 'string', format: 'date-time' },
                version: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: securityComplianceController.recordConsent.bind(
      securityComplianceController
    ),
  });

  fastify.post('/gdpr/consent/withdraw', {
    schema: {
      description: 'Withdraw GDPR consent',
      tags: ['GDPR', 'Compliance'],
      body: {
        type: 'object',
        required: ['subjectId', 'purpose'],
        properties: {
          subjectId: { type: 'string' },
          purpose: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    handler: securityComplianceController.withdrawConsent.bind(
      securityComplianceController
    ),
  });

  fastify.post('/gdpr/data-export', {
    schema: {
      description: 'Request GDPR data export',
      tags: ['GDPR', 'Compliance'],
      body: {
        type: 'object',
        required: ['subjectId'],
        properties: {
          subjectId: { type: 'string' },
          format: { type: 'string', enum: ['json', 'xml', 'csv'] },
          includeMetadata: { type: 'boolean' },
        },
      },
      response: {
        202: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                subjectId: { type: 'string' },
                status: { type: 'string' },
                requestedAt: { type: 'string', format: 'date-time' },
                format: { type: 'string' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: securityComplianceController.requestDataExport.bind(
      securityComplianceController
    ),
  });

  fastify.post('/gdpr/data-deletion', {
    schema: {
      description: 'Request GDPR data deletion (Right to be Forgotten)',
      tags: ['GDPR', 'Compliance'],
      body: {
        type: 'object',
        required: ['subjectId'],
        properties: {
          subjectId: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      response: {
        202: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                subjectId: { type: 'string' },
                status: { type: 'string' },
                requestedAt: { type: 'string', format: 'date-time' },
                scheduledFor: { type: 'string', format: 'date-time' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: securityComplianceController.requestDataDeletion.bind(
      securityComplianceController
    ),
  });

  // Compliance Reporting Routes
  fastify.post('/compliance/reports', {
    schema: {
      description: 'Generate compliance report',
      tags: ['Compliance', 'Reporting'],
      body: {
        type: 'object',
        required: ['reportPeriod'],
        properties: {
          standards: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['GDPR', 'SOC2', 'ISO27001', 'NIST'],
            },
          },
          reportPeriod: {
            type: 'object',
            required: ['from', 'to'],
            properties: {
              from: { type: 'string', format: 'date-time' },
              to: { type: 'string', format: 'date-time' },
            },
          },
          reportType: {
            type: 'string',
            enum: ['self_assessment', 'audit_preparation', 'certification'],
          },
        },
      },
    },
    handler: securityComplianceController.generateComplianceReport.bind(
      securityComplianceController
    ),
  });

  // Vulnerability Scanning Routes
  fastify.post('/security/vulnerability-scan', {
    schema: {
      description: 'Run vulnerability scan',
      tags: ['Security', 'Vulnerability'],
      body: {
        type: 'object',
        properties: {
          scanType: {
            type: 'string',
            enum: ['dependency', 'code', 'infrastructure', 'comprehensive'],
          },
        },
      },
    },
    handler: securityComplianceController.runVulnerabilityScan.bind(
      securityComplianceController
    ),
  });

  fastify.get('/security/vulnerability-statistics', {
    schema: {
      description: 'Get vulnerability statistics',
      tags: ['Security', 'Vulnerability'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                bySeverity: { type: 'object' },
                byStatus: { type: 'object' },
                byCategory: { type: 'object' },
                recentScans: { type: 'number' },
              },
            },
          },
        },
      },
    },
    handler: securityComplianceController.getVulnerabilityStatistics.bind(
      securityComplianceController
    ),
  });

  // Secure Configuration Routes
  fastify.post('/security/config', {
    schema: {
      description: 'Set secure configuration',
      tags: ['Security', 'Configuration'],
      body: {
        type: 'object',
        required: ['key', 'value'],
        properties: {
          key: { type: 'string' },
          value: {}, // any type
          sensitive: { type: 'boolean' },
          environment: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    handler: securityComplianceController.setSecureConfiguration.bind(
      securityComplianceController
    ),
  });

  fastify.get('/security/config/:key', {
    schema: {
      description: 'Get secure configuration',
      tags: ['Security', 'Configuration'],
      params: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          environment: { type: 'string' },
        },
      },
    },
    handler: securityComplianceController.getSecureConfiguration.bind(
      securityComplianceController
    ),
  });

  fastify.get('/security/config-audit', {
    schema: {
      description: 'Get configuration audit log',
      tags: ['Security', 'Configuration', 'Audit'],
      querystring: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          actor: { type: 'string' },
          action: { type: 'string' },
          limit: { type: 'number' },
        },
      },
    },
    handler: securityComplianceController.getConfigurationAuditLog.bind(
      securityComplianceController
    ),
  });

  // Data Encryption Routes
  fastify.post('/security/encrypt', {
    schema: {
      description: 'Encrypt data',
      tags: ['Security', 'Encryption'],
      body: {
        type: 'object',
        required: ['data'],
        properties: {
          data: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              algorithm: { type: 'string' },
              keyDerivation: { type: 'string' },
            },
          },
        },
      },
    },
    handler: securityComplianceController.encryptData.bind(
      securityComplianceController
    ),
  });

  fastify.post('/security/decrypt', {
    schema: {
      description: 'Decrypt data',
      tags: ['Security', 'Encryption'],
      body: {
        type: 'object',
        required: ['encryptionResult'],
        properties: {
          encryptionResult: {
            type: 'object',
            required: ['encrypted', 'iv', 'salt', 'algorithm'],
            properties: {
              encrypted: { type: 'string' },
              iv: { type: 'string' },
              salt: { type: 'string' },
              algorithm: { type: 'string' },
              tag: { type: 'string' },
            },
          },
        },
      },
    },
    handler: securityComplianceController.decryptData.bind(
      securityComplianceController
    ),
  });

  fastify.get('/security/encryption-statistics', {
    schema: {
      description: 'Get encryption statistics',
      tags: ['Security', 'Encryption'],
    },
    handler: securityComplianceController.getEncryptionStatistics.bind(
      securityComplianceController
    ),
  });

  // Tamper Protection Routes
  fastify.post('/security/protect-data', {
    schema: {
      description: 'Protect data with tamper detection',
      tags: ['Security', 'Tamper Protection'],
      body: {
        type: 'object',
        required: ['data', 'metadata'],
        properties: {
          data: {}, // any type
          metadata: {
            type: 'object',
            required: ['source', 'classification'],
            properties: {
              source: { type: 'string' },
              classification: {
                type: 'string',
                enum: ['public', 'internal', 'confidential', 'restricted'],
              },
              retentionPeriod: { type: 'number' },
            },
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: securityComplianceController.protectData.bind(
      securityComplianceController
    ),
  });

  fastify.get('/security/verify-integrity/:dataId', {
    schema: {
      description: 'Verify data integrity',
      tags: ['Security', 'Tamper Protection'],
      params: {
        type: 'object',
        required: ['dataId'],
        properties: {
          dataId: { type: 'string' },
        },
      },
    },
    handler: securityComplianceController.verifyDataIntegrity.bind(
      securityComplianceController
    ),
  });

  fastify.get('/security/integrity-violations', {
    schema: {
      description: 'Get integrity violations',
      tags: ['Security', 'Tamper Protection'],
      querystring: {
        type: 'object',
        properties: {
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          resolved: { type: 'boolean' },
          limit: { type: 'number' },
        },
      },
    },
    handler: securityComplianceController.getIntegrityViolations.bind(
      securityComplianceController
    ),
  });

  // Compliance Scanning Routes
  fastify.post('/compliance/scan', {
    schema: {
      description: 'Run compliance scan',
      tags: ['Compliance', 'Scanning'],
      body: {
        type: 'object',
        properties: {
          standard: {
            type: 'string',
            enum: ['GDPR', 'SOC2', 'ISO27001', 'NIST', 'PCI_DSS', 'HIPAA'],
          },
          comprehensive: { type: 'boolean' },
        },
      },
    },
    handler: securityComplianceController.runComplianceScan.bind(
      securityComplianceController
    ),
  });

  fastify.get('/compliance/dashboard', {
    schema: {
      description: 'Get compliance dashboard',
      tags: ['Compliance', 'Dashboard'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                overallCompliance: { type: 'number' },
                standardsCompliance: { type: 'object' },
                criticalFindings: { type: 'array' },
                upcomingScans: { type: 'array' },
                trends: { type: 'array' },
              },
            },
          },
        },
      },
    },
    handler: securityComplianceController.getComplianceDashboard.bind(
      securityComplianceController
    ),
  });

  // Health Check Route
  fastify.get('/security/health', {
    schema: {
      description: 'Get security compliance health check',
      tags: ['Security', 'Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                overallHealth: {
                  type: 'string',
                  enum: ['healthy', 'degraded', 'unhealthy'],
                },
                components: { type: 'object' },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
    handler: securityComplianceController.getSecurityHealthCheck.bind(
      securityComplianceController
    ),
  });
}
