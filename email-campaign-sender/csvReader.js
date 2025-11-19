import fs from 'fs';
import csvParser from 'csv-parser';
import validator from 'validator';
import config from './config.js';

/**
 * Reads and parses CSV contacts with flexible column mapping
 * @param {string} filePath - Path to CSV file
 * @returns {Promise<Array>} Array of contact objects
 */
export async function readContacts(filePath) {
  return new Promise((resolve, reject) => {
    const contacts = [];
    const headers = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('headers', (headerList) => {
        headers.push(...headerList);
      })
      .on('data', (row) => {
        // Map CSV columns to standardized fields
        const contact = mapContactFields(row, headers);

        // Only add contacts with valid data
        if (contact) {
          contacts.push(contact);
        }
      })
      .on('end', () => {
        resolve(contacts);
      })
      .on('error', (error) => {
        reject(new Error(`Error reading CSV: ${error.message}`));
      });
  });
}

/**
 * Maps CSV row to standardized contact object
 * @param {Object} row - CSV row data
 * @param {Array} headers - CSV headers
 * @returns {Object|null} Mapped contact or null if invalid
 */
function mapContactFields(row, headers) {
  const contact = {
    company: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    city: '',
    trade: '',
    rating: '',
    reviews: '',
    mapsLink: '',
    firstName: '',
  };

  // Map each field using column mappings
  for (const [field, possibleColumns] of Object.entries(config.csvMapping)) {
    for (const column of possibleColumns) {
      if (headers.includes(column) && row[column]) {
        contact[field] = row[column].trim();
        break;
      }
    }
  }

  // Extract first name from company name
  if (contact.company) {
    contact.firstName = extractFirstName(contact.company);
  }

  // Validate email
  if (!contact.email || contact.email.toLowerCase() === 'n/a') {
    return null; // Skip contacts without valid email
  }

  // Basic email validation
  if (!validator.isEmail(contact.email)) {
    return null; // Skip invalid emails
  }

  return contact;
}

/**
 * Extracts first name from business name
 * @param {string} businessName - Business name
 * @returns {string} Extracted first name or "there"
 */
function extractFirstName(businessName) {
  if (!businessName) return 'there';

  // Remove common business suffixes
  const cleaned = businessName
    .replace(/\b(LLC|Inc|Corp|Ltd|Company|Co|&|and)\b/gi, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .trim();

  // Get first word
  const firstWord = cleaned.split(/\s+/)[0];

  // If first word is too short or common, use "there"
  const commonWords = ['the', 'a', 'an'];
  if (!firstWord || firstWord.length < 2 || commonWords.includes(firstWord.toLowerCase())) {
    return 'there';
  }

  return firstWord;
}

/**
 * Validates CSV file exists and is readable
 * @param {string} filePath - Path to CSV file
 * @throws {Error} if file doesn't exist or isn't readable
 */
export async function validateCsvFile(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch (error) {
    throw new Error(`Cannot read CSV file: ${filePath}`);
  }
}

/**
 * Gets CSV file statistics
 * @param {Array} contacts - Array of contacts
 * @returns {Object} Statistics object
 */
export function getContactStats(contacts) {
  return {
    total: contacts.length,
    withPhone: contacts.filter(c => c.phone).length,
    withWebsite: contacts.filter(c => c.website).length,
    withAddress: contacts.filter(c => c.address).length,
    cities: [...new Set(contacts.map(c => c.city).filter(Boolean))],
  };
}

export default {
  readContacts,
  validateCsvFile,
  getContactStats,
};
