/**
 * Template Engine for Email and SMS notifications
 */

import { logger } from '@company/logger';
import Handlebars from 'handlebars';
import mjml2html from 'mjml';
import { EmailTemplate, EmailTemplateData } from '../email/interfaces';

export interface TemplateRenderResult {
  success: boolean;
  html?: string;
  text?: string;
  subject?: string;
  error?: string;
}

export class TemplateEngine {
  private templates: Map<string, EmailTemplate> = new Map();

  constructor() {
    this.registerHelpers();
  }

  /**
   * Register a template
   */
  registerTemplate(template: EmailTemplate): void {
    this.templates.set(template.id, template);
    logger.debug('Template registered', { templateId: template.id, name: template.name });
  }

  /**
   * Render email template
   */
  renderEmail(templateId: string, data: EmailTemplateData): TemplateRenderResult {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        return {
          success: false,
          error: `Template not found: ${templateId}`,
        };
      }

      // Compile and render subject
      const subjectTemplate = Handlebars.compile(template.subject);
      const subject = subjectTemplate(data);

      // Compile and render HTML
      let html: string | undefined;
      if (template.htmlTemplate) {
        const htmlTemplate = Handlebars.compile(template.htmlTemplate);
        const renderedHtml = htmlTemplate(data);
        
        // Check if it's MJML template
        if (renderedHtml.includes('<mjml>')) {
          const mjmlResult = mjml2html(renderedHtml);
          if (mjmlResult.errors.length > 0) {
            logger.warn('MJML template has warnings', {
              templateId,
              errors: mjmlResult.errors,
            });
          }
          html = mjmlResult.html;
        } else {
          html = renderedHtml;
        }
      }

      // Compile and render text
      let text: string | undefined;
      if (template.textTemplate) {
        const textTemplate = Handlebars.compile(template.textTemplate);
        text = textTemplate(data);
      }

      return {
        success: true,
        html,
        text,
        subject,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Template rendering failed', {
        templateId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Render SMS template
   */
  renderSMS(template: string, data: EmailTemplateData): TemplateRenderResult {
    try {
      const smsTemplate = Handlebars.compile(template);
      const text = smsTemplate(data);

      return {
        success: true,
        text,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('SMS template rendering failed', {
        template: template.substring(0, 50) + '...',
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get all registered templates
   */
  getTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): EmailTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Remove template
   */
  removeTemplate(templateId: string): boolean {
    return this.templates.delete(templateId);
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: Date, format: string) => {
      if (!date) return '';
      
      const d = new Date(date);
      switch (format) {
        case 'short':
          return d.toLocaleDateString();
        case 'long':
          return d.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
        case 'time':
          return d.toLocaleTimeString();
        default:
          return d.toISOString();
      }
    });

    // Currency formatting helper
    Handlebars.registerHelper('formatCurrency', (amount: number, currency = 'USD') => {
      if (typeof amount !== 'number') return '';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).format(amount);
    });

    // Conditional helper
    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // Uppercase helper
    Handlebars.registerHelper('uppercase', (str: string) => {
      return str ? str.toUpperCase() : '';
    });

    // Lowercase helper
    Handlebars.registerHelper('lowercase', (str: string) => {
      return str ? str.toLowerCase() : '';
    });

    // Truncate helper
    Handlebars.registerHelper('truncate', (str: string, length: number) => {
      if (!str || str.length <= length) return str;
      return str.substring(0, length) + '...';
    });
  }
}