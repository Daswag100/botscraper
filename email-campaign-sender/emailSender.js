import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import Handlebars from 'handlebars';
import config from './config.js';
import logger from './logger.js';

// Initialize Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.gmail.email,
    pass: config.gmail.appPassword,
  },
});

/**
 * Email sender class handling Gmail SMTP integration
 */
class EmailSender {
  constructor() {
    this.templateCache = {};
  }

  /**
   * Verifies SMTP connection
   * @returns {Promise<boolean>} Connection status
   */
  async verifyConnection() {
    try {
      await transporter.verify();
      return true;
    } catch (error) {
      console.error('Gmail SMTP connection failed:', error.message);
      return false;
    }
  }

  /**
   * Loads and compiles an HTML email template
   * @param {string} templatePath - Path to template file
   * @returns {Promise<Function>} Compiled Handlebars template
   */
  async loadTemplate(templatePath) {
    // Check cache first
    if (this.templateCache[templatePath]) {
      return this.templateCache[templatePath];
    }

    try {
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiled = Handlebars.compile(templateContent);
      this.templateCache[templatePath] = compiled;
      return compiled;
    } catch (error) {
      throw new Error(`Failed to load template ${templatePath}: ${error.message}`);
    }
  }

  /**
   * Renders template with contact data
   * @param {Function} template - Compiled template
   * @param {Object} contact - Contact data
   * @returns {string} Rendered HTML or text
   */
  renderTemplate(template, contact) {
    const templateData = {
      ...contact,
      currentDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      unsubscribeUrl: config.urls.unsubscribe,
      senderEmail: config.gmail.email, // Add sender's email for reply links
      senderName: config.gmail.senderName || config.gmail.fromName, // Add sender name
    };

    return template(templateData);
  }

  /**
   * Extracts subject from template (supports both HTML and plain text)
   * @param {string} content - Template content
   * @returns {string} Subject line
   */
  extractSubject(content) {
    // Try HTML comment format: <!-- SUBJECT: ... -->
    const htmlMatch = content.match(/<!--\s*SUBJECT:\s*(.+?)\s*-->/i);
    if (htmlMatch) {
      return htmlMatch[1].trim();
    }

    // Try plain text format: SUBJECT: ... (first line)
    const textMatch = content.match(/^SUBJECT:\s*(.+?)$/im);
    if (textMatch) {
      return textMatch[1].trim();
    }

    return 'Important Message';
  }

  /**
   * Determines if template is plain text based on file extension
   * @param {string} templatePath - Path to template file
   * @returns {boolean} True if plain text template
   */
  isPlainTextTemplate(templatePath) {
    return templatePath.endsWith('.txt');
  }

  /**
   * Removes subject line from plain text template content
   * @param {string} content - Template content
   * @returns {string} Content without subject line
   */
  removeSubjectLine(content) {
    return content.replace(/^SUBJECT:\s*.+?\n\n?/im, '').trim();
  }

  /**
   * Sends an email via Gmail SMTP
   * @param {Object} params - Email parameters
   * @returns {Promise<Object>} Send result
   */
  async send({ to, subject, html, text, campaignId, templateUsed }) {
    const mailOptions = {
      from: `${config.gmail.fromName} <${config.gmail.email}>`,
      to: to,
      subject: subject,
    };

    // Use text for plain text emails, html for HTML emails
    if (text) {
      mailOptions.text = text;
    } else if (html) {
      mailOptions.html = html;
    }

    try {
      const info = await transporter.sendMail(mailOptions);

      // Log success
      await logger.logSuccess({
        recipient_email: to,
        company_name: '',
        resend_message_id: info.messageId || '',
        retry_count: 0,
        campaign_id: campaignId,
        template_used: templateUsed,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Sends email with retry logic
   * @param {Object} params - Email parameters
   * @returns {Promise<Object>} Send result
   */
  async sendWithRetry(params) {
    const { contact, campaignId, templateUsed } = params;
    let lastError = null;

    for (let attempt = 0; attempt < config.campaign.maxRetries; attempt++) {
      try {
        const result = await this.send({
          to: contact.email,
          subject: params.subject,
          html: params.html,
          text: params.text,
          campaignId,
          templateUsed,
        });

        return {
          success: true,
          attempt: attempt + 1,
          ...result,
        };
      } catch (error) {
        lastError = error;

        // Check if it's a rate limit or temporary error
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.responseCode === 421) {
          const delay = config.campaign.retryDelays[attempt] || 8000;
          await this.sleep(delay);
          continue;
        }

        // For other errors, log and break
        break;
      }
    }

    // All retries failed
    await logger.logFailure({
      recipient_email: contact.email,
      company_name: contact.company,
      error_message: lastError?.message || 'Unknown error',
      retry_count: config.campaign.maxRetries,
      campaign_id: campaignId,
      template_used: templateUsed,
    });

    return {
      success: false,
      error: lastError?.message || 'Failed after retries',
    };
  }

  /**
   * Sends email to a contact
   * @param {Object} params - Send parameters
   * @returns {Promise<Object>} Result object
   */
  async sendToContact(params) {
    const { contact, templatePath, campaignId, mode } = params;

    try {
      // Load and compile template
      const template = await this.loadTemplate(templatePath);

      // Check if it's a plain text template
      const isPlainText = this.isPlainTextTemplate(templatePath);

      // Render content (HTML or plain text)
      const renderedContent = this.renderTemplate(template, contact);

      // Extract subject (with Handlebars variables rendered)
      const subjectTemplate = Handlebars.compile(this.extractSubject(renderedContent));
      const subject = subjectTemplate(contact);

      // Prepare email content
      let html = null;
      let text = null;

      if (isPlainText) {
        // For plain text templates, remove subject line and use as text
        text = this.removeSubjectLine(renderedContent);
      } else {
        // For HTML templates, use as html
        html = renderedContent;
      }

      // In test mode, override recipient
      const recipient = mode === 'test' ? config.gmail.email : contact.email;

      // Send with retry
      const result = await this.sendWithRetry({
        contact: { ...contact, email: recipient },
        subject,
        html,
        text,
        campaignId,
        templateUsed: templatePath,
      });

      return {
        ...result,
        contact,
      };
    } catch (error) {
      await logger.logFailure({
        recipient_email: contact.email,
        company_name: contact.company,
        error_message: error.message,
        retry_count: 0,
        campaign_id: campaignId,
        template_used: templatePath,
      });

      return {
        success: false,
        error: error.message,
        contact,
      };
    }
  }

  /**
   * Previews rendered email for a contact
   * @param {Object} contact - Contact data
   * @param {string} templatePath - Template path
   * @returns {Promise<Object>} Preview data
   */
  async preview(contact, templatePath) {
    const template = await this.loadTemplate(templatePath);
    const isPlainText = this.isPlainTextTemplate(templatePath);
    const renderedContent = this.renderTemplate(template, contact);
    const subjectTemplate = Handlebars.compile(this.extractSubject(renderedContent));
    const subject = subjectTemplate(contact);

    const previewData = {
      to: contact.email,
      subject,
      contact,
    };

    if (isPlainText) {
      previewData.text = this.removeSubjectLine(renderedContent);
      previewData.isPlainText = true;
    } else {
      previewData.html = renderedContent;
      previewData.isPlainText = false;
    }

    return previewData;
  }

  /**
   * Validates template syntax
   * @param {string} templatePath - Template path
   * @returns {Promise<Object>} Validation result
   */
  async validateTemplate(templatePath) {
    try {
      await this.loadTemplate(templatePath);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Sleep helper for delays
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new EmailSender();
