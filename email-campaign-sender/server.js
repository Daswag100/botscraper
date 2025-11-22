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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'data'));
  },
  filename: (req, file, cb) => {
    cb(null, 'contacts.csv');
  }
});
const upload = multer({ storage });

// Campaign state
let campaignState = {
  isRunning: false,
  progress: { sent: 0, failed: 0, skipped: 0, total: 0 },
  currentCampaignId: null,
  logs: []
};

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
      .filter(f => f.endsWith('.html'))
      .map(f => ({
        name: f.replace('.html', ''),
        path: path.join(templatesDir, f)
      }));
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contacts from uploaded CSV
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await readContacts(config.paths.defaultContacts);
    const stats = getContactStats(contacts);
    res.json({ contacts, stats, count: contacts.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload CSV file
app.post('/api/upload', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const contacts = await readContacts(config.paths.defaultContacts);
    const stats = getContactStats(contacts);
    res.json({
      message: 'File uploaded successfully',
      count: contacts.length,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preview email for a contact
app.post('/api/preview', async (req, res) => {
  try {
    const { contactIndex, templateName } = req.body;
    const contacts = await readContacts(config.paths.defaultContacts);

    if (contactIndex >= contacts.length) {
      return res.status(400).json({ error: 'Invalid contact index' });
    }

    const templatePath = path.join(config.paths.templates, `${templateName}.html`);
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
    const contacts = await readContacts(config.paths.defaultContacts);

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts available' });
    }

    const templatePath = path.join(config.paths.templates, `${templateName}.html`);
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
    const contacts = await readContacts(config.paths.defaultContacts);

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts available' });
    }

    const templatePath = path.join(config.paths.templates, `${templateName}.html`);
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
