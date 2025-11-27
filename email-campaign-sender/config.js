import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Application configuration
 * Loads settings from environment variables with sensible defaults
 */
const config = {
  // Gmail SMTP Configuration
  gmail: {
    email: process.env.GMAIL_EMAIL,
    appPassword: process.env.GMAIL_APP_PASSWORD,
    fromName: process.env.FROM_NAME || 'Real Estate Opportunities',
  },

  // Email Campaign Settings
  campaign: {
    dailyLimit: parseInt(process.env.DAILY_LIMIT) || 100,
    delayBetweenEmails: parseInt(process.env.DELAY_BETWEEN_EMAILS) || 2000,
    enableTracking: process.env.ENABLE_TRACKING === 'true',
    maxRetries: 3,
    retryDelays: [2000, 4000, 8000], // Exponential backoff in milliseconds
  },

  // URLs
  urls: {
    unsubscribe: process.env.UNSUBSCRIBE_URL || 'mailto:youremail@gmail.com?subject=Unsubscribe',
  },

  // File Paths
  paths: {
    templates: join(__dirname, 'templates'),
    data: join(__dirname, 'data'),
    logs: join(__dirname, 'logs'),
    defaultContacts: join(__dirname, 'data', 'contacts.csv'),
    defaultTemplate: join(__dirname, 'templates', 'realestate.html'),
    sentLog: join(__dirname, 'logs', 'sent_log.csv'),
    checkpoint: join(__dirname, '.checkpoint.json'),
  },

  // CSV Column Mappings
  // Maps various CSV column names to standardized field names
  csvMapping: {
    company: ['Business Name', 'Company', 'Company Name', 'Business'],
    email: ['Email', 'Email Address', 'E-mail', 'Contact Email'],
    phone: ['Phone Number', 'Phone', 'Contact Phone', 'Telephone'],
    address: ['Address', 'Street Address', 'Location Address', 'Full Address'],
    website: ['Website', 'Website URL', 'URL', 'Web'],
    city: ['Location', 'City', 'Area', 'Region'],
    trade: ['Business Type', 'Type', 'Category', 'Industry'],
    rating: ['Rating', 'Google Rating', 'Stars'],
    reviews: ['Reviews', 'Review Count', 'Number of Reviews'],
    mapsLink: ['Google Maps Link', 'Maps Link', 'Map URL', 'Google Maps URL', 'googleMapsLink'],
  },

  // Checkpoint Settings
  checkpoint: {
    saveInterval: 10, // Save progress every N emails
  },
};

/**
 * Validates required configuration
 * @throws {Error} if required config is missing
 */
export function validateConfig() {
  const errors = [];

  if (!config.gmail.email) {
    errors.push('GMAIL_EMAIL is required. Please set it in your .env file.');
  }

  if (!config.gmail.appPassword) {
    errors.push('GMAIL_APP_PASSWORD is required. Please set it in your .env file.');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

export default config;
