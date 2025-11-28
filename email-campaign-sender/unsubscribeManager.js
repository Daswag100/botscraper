import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class UnsubscribeManager {
  constructor() {
    this.unsubscribeFile = path.join(__dirname, 'logs', 'unsubscribes.csv');
    this.tokensFile = path.join(__dirname, 'logs', 'unsubscribe_tokens.csv');
    this.ensureFilesExist();
  }

  ensureFilesExist() {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create unsubscribes.csv if it doesn't exist
    if (!fs.existsSync(this.unsubscribeFile)) {
      const headers = 'timestamp,email,token,ip_address,user_agent\n';
      fs.writeFileSync(this.unsubscribeFile, headers);
    }

    // Create unsubscribe_tokens.csv if it doesn't exist
    if (!fs.existsSync(this.tokensFile)) {
      const headers = 'token,email,created_at,campaign_id\n';
      fs.writeFileSync(this.tokensFile, headers);
    }
  }

  /**
   * Generate a unique unsubscribe token for an email address
   * @param {string} email - The email address
   * @param {string} campaignId - Optional campaign ID
   * @returns {string} - Unique token
   */
  generateToken(email, campaignId = '') {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .createHash('sha256')
      .update(`${email}:${timestamp}:${randomBytes}`)
      .digest('hex');

    // Use first 32 characters for a clean URL-safe token
    const token = hash.substring(0, 32);

    // Store token mapping
    this.storeToken(token, email, campaignId);

    return token;
  }

  /**
   * Store token to email mapping
   * @param {string} token - The unsubscribe token
   * @param {string} email - The email address
   * @param {string} campaignId - Optional campaign ID
   */
  storeToken(token, email, campaignId = '') {
    const timestamp = new Date().toISOString();
    const line = `${token},${email},${timestamp},${campaignId}\n`;
    fs.appendFileSync(this.tokensFile, line);
  }

  /**
   * Get email address from token
   * @param {string} token - The unsubscribe token
   * @returns {string|null} - Email address or null if not found
   */
  getEmailFromToken(token) {
    if (!fs.existsSync(this.tokensFile)) {
      return null;
    }

    const content = fs.readFileSync(this.tokensFile, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header

    for (const line of lines) {
      if (!line.trim()) continue;

      const [storedToken, email] = line.split(',');
      if (storedToken === token) {
        return email;
      }
    }

    return null;
  }

  /**
   * Add an email to the unsubscribe list
   * @param {string} email - The email address
   * @param {string} token - The unsubscribe token used
   * @param {string} ipAddress - Optional IP address
   * @param {string} userAgent - Optional user agent
   * @returns {boolean} - True if successful
   */
  unsubscribe(email, token, ipAddress = '', userAgent = '') {
    if (!email) {
      return false;
    }

    // Check if already unsubscribed
    if (this.isUnsubscribed(email)) {
      return true; // Already unsubscribed, consider it successful
    }

    const timestamp = new Date().toISOString();
    const cleanEmail = email.toLowerCase().trim();
    const cleanIp = (ipAddress || '').replace(/,/g, ';');
    const cleanUserAgent = (userAgent || '').replace(/,/g, ';');

    const line = `${timestamp},${cleanEmail},${token},${cleanIp},${cleanUserAgent}\n`;
    fs.appendFileSync(this.unsubscribeFile, line);

    return true;
  }

  /**
   * Check if an email is unsubscribed
   * @param {string} email - The email address to check
   * @returns {boolean} - True if unsubscribed
   */
  isUnsubscribed(email) {
    if (!email || !fs.existsSync(this.unsubscribeFile)) {
      return false;
    }

    const cleanEmail = email.toLowerCase().trim();
    const content = fs.readFileSync(this.unsubscribeFile, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split(',');
      if (parts.length >= 2) {
        const unsubscribedEmail = parts[1].toLowerCase().trim();
        if (unsubscribedEmail === cleanEmail) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get all unsubscribed emails
   * @returns {Array<string>} - Array of unsubscribed email addresses
   */
  getAllUnsubscribed() {
    if (!fs.existsSync(this.unsubscribeFile)) {
      return [];
    }

    const content = fs.readFileSync(this.unsubscribeFile, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header
    const emails = new Set();

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split(',');
      if (parts.length >= 2) {
        emails.add(parts[1].toLowerCase().trim());
      }
    }

    return Array.from(emails);
  }

  /**
   * Get unsubscribe statistics
   * @returns {Object} - Statistics object
   */
  getStats() {
    if (!fs.existsSync(this.unsubscribeFile)) {
      return {
        total: 0,
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
      };
    }

    const content = fs.readFileSync(this.unsubscribeFile, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let total = 0;
    let today = 0;
    let thisWeek = 0;
    let thisMonth = 0;

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split(',');
      if (parts.length >= 1) {
        total++;
        const timestamp = new Date(parts[0]);

        if (timestamp >= todayStart) today++;
        if (timestamp >= weekStart) thisWeek++;
        if (timestamp >= monthStart) thisMonth++;
      }
    }

    return { total, today, thisWeek, thisMonth };
  }

  /**
   * Remove an email from unsubscribe list (re-subscribe)
   * @param {string} email - The email address
   * @returns {boolean} - True if successful
   */
  resubscribe(email) {
    if (!email || !fs.existsSync(this.unsubscribeFile)) {
      return false;
    }

    const cleanEmail = email.toLowerCase().trim();
    const content = fs.readFileSync(this.unsubscribeFile, 'utf-8');
    const lines = content.split('\n');

    const filteredLines = lines.filter((line, index) => {
      if (index === 0) return true; // Keep header
      if (!line.trim()) return false; // Remove empty lines

      const parts = line.split(',');
      if (parts.length >= 2) {
        const unsubscribedEmail = parts[1].toLowerCase().trim();
        return unsubscribedEmail !== cleanEmail;
      }
      return true;
    });

    fs.writeFileSync(this.unsubscribeFile, filteredLines.join('\n') + '\n');
    return true;
  }
}

export default new UnsubscribeManager();
