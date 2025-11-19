import fs from 'fs/promises';
import { existsSync } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import csvParser from 'csv-parser';
import { createReadStream } from 'fs';
import config from './config.js';

/**
 * Logger class for tracking email sends
 * Logs all email activity to CSV file for tracking and duplicate prevention
 */
class Logger {
  constructor() {
    this.logPath = config.paths.sentLog;
    this.csvWriter = null;
    this.initializeWriter();
  }

  /**
   * Initializes the CSV writer with headers
   */
  async initializeWriter() {
    // Ensure logs directory exists
    await fs.mkdir(config.paths.logs, { recursive: true });

    // Check if log file exists
    const fileExists = existsSync(this.logPath);

    this.csvWriter = createObjectCsvWriter({
      path: this.logPath,
      header: [
        { id: 'timestamp', title: 'timestamp' },
        { id: 'recipient_email', title: 'recipient_email' },
        { id: 'company_name', title: 'company_name' },
        { id: 'status', title: 'status' },
        { id: 'resend_message_id', title: 'resend_message_id' },
        { id: 'error_message', title: 'error_message' },
        { id: 'retry_count', title: 'retry_count' },
        { id: 'campaign_id', title: 'campaign_id' },
        { id: 'template_used', title: 'template_used' },
      ],
      append: fileExists,
    });
  }

  /**
   * Logs a successful email send
   * @param {Object} data - Email send data
   */
  async logSuccess(data) {
    await this.log({
      ...data,
      status: 'success',
      error_message: '',
    });
  }

  /**
   * Logs a failed email send
   * @param {Object} data - Email send data with error
   */
  async logFailure(data) {
    await this.log({
      ...data,
      status: 'failed',
    });
  }

  /**
   * Logs a skipped email
   * @param {Object} data - Email skip data
   */
  async logSkipped(data) {
    await this.log({
      ...data,
      status: 'skipped',
      resend_message_id: '',
      error_message: data.error_message || 'Invalid or missing email',
      retry_count: 0,
    });
  }

  /**
   * Writes a log entry to CSV
   * @param {Object} data - Log entry data
   */
  async log(data) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      recipient_email: data.recipient_email || '',
      company_name: data.company_name || '',
      status: data.status,
      resend_message_id: data.resend_message_id || '',
      error_message: data.error_message || '',
      retry_count: data.retry_count || 0,
      campaign_id: data.campaign_id || '',
      template_used: data.template_used || '',
    };

    try {
      await this.csvWriter.writeRecords([logEntry]);
    } catch (error) {
      console.error('Error writing to log file:', error.message);
    }
  }

  /**
   * Gets emails sent today for daily limit checking
   * @returns {Promise<number>} Count of emails sent today
   */
  async getTodaysSentCount() {
    if (!existsSync(this.logPath)) {
      return 0;
    }

    const today = new Date().toISOString().split('T')[0];
    let count = 0;

    return new Promise((resolve, reject) => {
      createReadStream(this.logPath)
        .pipe(csvParser())
        .on('data', (row) => {
          const logDate = row.timestamp.split('T')[0];
          if (logDate === today && row.status === 'success') {
            count++;
          }
        })
        .on('end', () => resolve(count))
        .on('error', reject);
    });
  }

  /**
   * Checks if an email was already sent today
   * @param {string} email - Email address to check
   * @returns {Promise<boolean>} True if email was sent today
   */
  async wasEmailSentToday(email) {
    if (!existsSync(this.logPath)) {
      return false;
    }

    const today = new Date().toISOString().split('T')[0];

    return new Promise((resolve, reject) => {
      let found = false;

      createReadStream(this.logPath)
        .pipe(csvParser())
        .on('data', (row) => {
          const logDate = row.timestamp.split('T')[0];
          if (
            logDate === today &&
            row.recipient_email.toLowerCase() === email.toLowerCase() &&
            row.status === 'success'
          ) {
            found = true;
          }
        })
        .on('end', () => resolve(found))
        .on('error', reject);
    });
  }

  /**
   * Gets all sent emails for duplicate detection
   * @returns {Promise<Set>} Set of email addresses that have been sent to
   */
  async getAllSentEmails() {
    if (!existsSync(this.logPath)) {
      return new Set();
    }

    const emails = new Set();

    return new Promise((resolve, reject) => {
      createReadStream(this.logPath)
        .pipe(csvParser())
        .on('data', (row) => {
          if (row.status === 'success' && row.recipient_email) {
            emails.add(row.recipient_email.toLowerCase());
          }
        })
        .on('end', () => resolve(emails))
        .on('error', reject);
    });
  }

  /**
   * Gets campaign statistics
   * @param {string} campaignId - Campaign ID to get stats for
   * @returns {Promise<Object>} Campaign statistics
   */
  async getCampaignStats(campaignId) {
    if (!existsSync(this.logPath)) {
      return {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
      };
    }

    const stats = {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
    };

    return new Promise((resolve, reject) => {
      createReadStream(this.logPath)
        .pipe(csvParser())
        .on('data', (row) => {
          if (row.campaign_id === campaignId) {
            stats.total++;
            if (row.status === 'success') stats.success++;
            if (row.status === 'failed') stats.failed++;
            if (row.status === 'skipped') stats.skipped++;
          }
        })
        .on('end', () => resolve(stats))
        .on('error', reject);
    });
  }
}

export default new Logger();
