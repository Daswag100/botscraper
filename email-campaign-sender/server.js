import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import config, { validateConfig } from './config.js';
import { readContacts, getContactStats } from './csvReader.js';
import emailSender from './emailSender.js';
import logger from './logger.js';
import unsubscribeManager from './unsubscribeManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// File upload config - support multiple CSV files (up to 10)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'data'));
  },
  filename: (req, file, cb) => {
    // Save each file with timestamp to avoid overwriting
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${originalName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Track uploaded CSV files
let uploadedCsvFiles = [];

// Campaign state
let campaignState = {
  isRunning: false,
  progress: { sent: 0, failed: 0, skipped: 0, total: 0 },
  currentCampaignId: null,
  logs: []
};

// Helper function to read and merge multiple CSV files
async function readAndMergeContacts(csvFiles) {
  const allContacts = [];
  const seenEmails = new Set();

  for (const csvFile of csvFiles) {
    try {
      const filePath = path.join(__dirname, 'data', csvFile);
      const contacts = await readContacts(filePath);

      // Add unique contacts only (deduplicate by email)
      for (const contact of contacts) {
        const emailLower = contact.email.toLowerCase();
        if (!seenEmails.has(emailLower)) {
          seenEmails.add(emailLower);
          allContacts.push(contact);
        }
      }
    } catch (error) {
      console.error(`Error reading ${csvFile}:`, error.message);
    }
  }

  return allContacts;
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', gmail: config.gmail.email });
});

// Get available templates
app.get('/api/templates', async (req, res) => {
  try {
    const templatesDir = config.paths.templates;
    const files = await fs.readdir(templatesDir);
    const templates = files
      .filter(f => f.endsWith('.html') || f.endsWith('.txt'))
      .map(f => ({
        name: f.replace(/\.(html|txt)$/, ''),
        filename: f,
        type: f.endsWith('.txt') ? 'text' : 'html',
        path: path.join(templatesDir, f)
      }));
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contacts from uploaded CSV files (or default)
app.get('/api/contacts', async (req, res) => {
  try {
    let contacts;
    if (uploadedCsvFiles.length > 0) {
      contacts = await readAndMergeContacts(uploadedCsvFiles);
    } else {
      contacts = await readContacts(config.paths.defaultContacts);
    }
    const stats = getContactStats(contacts);
    res.json({
      contacts,
      stats,
      count: contacts.length,
      filesLoaded: uploadedCsvFiles.length || 1
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload multiple CSV files (up to 10)
app.post('/api/upload', upload.array('csvFiles', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Store the uploaded filenames
    uploadedCsvFiles = req.files.map(f => f.filename);

    // Read and merge all contacts
    const contacts = await readAndMergeContacts(uploadedCsvFiles);
    const stats = getContactStats(contacts);

    res.json({
      message: `${req.files.length} file(s) uploaded successfully`,
      filesUploaded: req.files.length,
      fileNames: req.files.map(f => f.originalname),
      count: contacts.length,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear uploaded files
app.post('/api/clear-uploads', async (req, res) => {
  try {
    // Delete uploaded files
    for (const file of uploadedCsvFiles) {
      const filePath = path.join(__dirname, 'data', file);
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.error(`Error deleting ${file}:`, err.message);
      }
    }

    uploadedCsvFiles = [];
    res.json({ message: 'Uploaded files cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preview email for a contact
app.post('/api/preview', async (req, res) => {
  try {
    const { contactIndex, templateName } = req.body;

    // Get contacts from uploaded files or default
    let contacts;
    if (uploadedCsvFiles.length > 0) {
      contacts = await readAndMergeContacts(uploadedCsvFiles);
    } else {
      contacts = await readContacts(config.paths.defaultContacts);
    }

    if (contactIndex >= contacts.length) {
      return res.status(400).json({ error: 'Invalid contact index' });
    }

    // Template name should include extension (.html or .txt)
    const templatePath = path.join(config.paths.templates, templateName);
    const preview = await emailSender.preview(contacts[contactIndex], templatePath);

    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send test email (to yourself)
app.post('/api/send-test', async (req, res) => {
  try {
    const { templateName } = req.body;

    // Get contacts from uploaded files or default
    let contacts;
    if (uploadedCsvFiles.length > 0) {
      contacts = await readAndMergeContacts(uploadedCsvFiles);
    } else {
      contacts = await readContacts(config.paths.defaultContacts);
    }

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts available' });
    }

    // Template name should include extension (.html or .txt)
    const templatePath = path.join(config.paths.templates, templateName);
    const campaignId = `test_${Date.now()}`;

    const result = await emailSender.sendToContact({
      contact: { ...contacts[0], email: config.gmail.email },
      templatePath,
      campaignId,
      mode: 'test'
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start campaign
app.post('/api/campaign/start', async (req, res) => {
  try {
    if (campaignState.isRunning) {
      return res.status(400).json({ error: 'Campaign already running' });
    }

    const { templateName, limit = 100, delay = 2000 } = req.body;

    // Get contacts from uploaded files or default
    let contacts;
    if (uploadedCsvFiles.length > 0) {
      contacts = await readAndMergeContacts(uploadedCsvFiles);
    } else {
      contacts = await readContacts(config.paths.defaultContacts);
    }

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts available' });
    }

    // Template name should include extension (.html or .txt)
    const templatePath = path.join(config.paths.templates, templateName);
    const campaignId = `campaign_${Date.now()}`;

    // Reset state
    campaignState = {
      isRunning: true,
      progress: { sent: 0, failed: 0, skipped: 0, total: Math.min(contacts.length, limit) },
      currentCampaignId: campaignId,
      logs: []
    };

    // Send response immediately
    res.json({
      message: 'Campaign started',
      campaignId,
      total: campaignState.progress.total
    });

    // Run campaign in background
    runCampaign(contacts.slice(0, limit), templatePath, campaignId, delay);

  } catch (error) {
    campaignState.isRunning = false;
    res.status(500).json({ error: error.message });
  }
});

// Background campaign runner
async function runCampaign(contacts, templatePath, campaignId, delay) {
  const processedEmails = new Set();

  for (let i = 0; i < contacts.length; i++) {
    if (!campaignState.isRunning) break;

    const contact = contacts[i];

    // Skip duplicates
    if (processedEmails.has(contact.email.toLowerCase())) {
      campaignState.progress.skipped++;
      campaignState.logs.push({
        email: contact.email,
        status: 'skipped',
        reason: 'Duplicate',
        timestamp: new Date().toISOString()
      });
      continue;
    }

    // Check if sent today
    const sentToday = await logger.wasEmailSentToday(contact.email);
    if (sentToday) {
      campaignState.progress.skipped++;
      campaignState.logs.push({
        email: contact.email,
        status: 'skipped',
        reason: 'Already sent today',
        timestamp: new Date().toISOString()
      });
      continue;
    }

    processedEmails.add(contact.email.toLowerCase());

    // Send email
    const result = await emailSender.sendToContact({
      contact,
      templatePath,
      campaignId,
      mode: 'live'
    });

    if (result.success) {
      campaignState.progress.sent++;
      campaignState.logs.push({
        email: contact.email,
        company: contact.company,
        status: 'sent',
        messageId: result.messageId,
        timestamp: new Date().toISOString()
      });
    } else if (result.skipped) {
      // Handle unsubscribed emails
      campaignState.progress.skipped++;
      campaignState.logs.push({
        email: contact.email,
        company: contact.company,
        status: 'skipped',
        reason: result.reason || 'Unsubscribed',
        timestamp: new Date().toISOString()
      });
    } else {
      campaignState.progress.failed++;
      campaignState.logs.push({
        email: contact.email,
        company: contact.company,
        status: 'failed',
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }

    // Delay between sends
    if (i < contacts.length - 1) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  campaignState.isRunning = false;
}

// Get campaign status
app.get('/api/campaign/status', (req, res) => {
  res.json({
    isRunning: campaignState.isRunning,
    progress: campaignState.progress,
    campaignId: campaignState.currentCampaignId,
    recentLogs: campaignState.logs.slice(-20)
  });
});

// Stop campaign
app.post('/api/campaign/stop', (req, res) => {
  campaignState.isRunning = false;
  res.json({ message: 'Campaign stopped' });
});

// Get campaign history/stats
app.get('/api/stats', async (req, res) => {
  try {
    const todaysSent = await logger.getTodaysSentCount();
    const allSent = await logger.getAllSentEmails();

    res.json({
      todaysSent,
      totalSent: allSent.length,
      dailyLimit: config.campaign.dailyLimit,
      remaining: config.campaign.dailyLimit - todaysSent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get email address from unsubscribe token (for preview)
app.get('/api/unsubscribe/:token/info', (req, res) => {
  try {
    const { token } = req.params;
    const email = unsubscribeManager.getEmailFromToken(token);

    if (!email) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    res.json({
      success: true,
      email: email
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Unsubscribe endpoint - serves HTML page
app.get('/api/unsubscribe/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'unsubscribe.html'));
});

// Process unsubscribe request
app.post('/api/unsubscribe/:token', (req, res) => {
  try {
    const { token } = req.params;
    const email = unsubscribeManager.getEmailFromToken(token);

    if (!email) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired unsubscribe token'
      });
    }

    // Get IP and user agent for logging
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Unsubscribe the email
    const success = unsubscribeManager.unsubscribe(email, token, ipAddress, userAgent);

    if (success) {
      res.json({
        success: true,
        message: 'Successfully unsubscribed',
        email: email
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to process unsubscribe request'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get unsubscribe statistics
app.get('/api/unsubscribe/stats', (req, res) => {
  try {
    const stats = unsubscribeManager.getStats();
    const allUnsubscribed = unsubscribeManager.getAllUnsubscribed();

    res.json({
      success: true,
      stats,
      count: allUnsubscribed.length,
      emails: allUnsubscribed
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Validate config and start server
try {
  validateConfig();
  app.listen(PORT, () => {
    console.log(`\n📧 Email Campaign Server running at http://localhost:${PORT}`);
    console.log(`📬 Sending from: ${config.gmail.email}`);
    console.log(`📊 Daily limit: ${config.campaign.dailyLimit} emails\n`);
  });
} catch (error) {
  console.error('Configuration error:', error.message);
  process.exit(1);
}
