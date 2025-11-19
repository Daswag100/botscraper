#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import readline from 'readline';
import config, { validateConfig } from './config.js';
import { readContacts, validateCsvFile, getContactStats } from './csvReader.js';
import emailSender from './emailSender.js';
import logger from './logger.js';

/**
 * Main application class
 */
class EmailCampaignSender {
  constructor() {
    this.program = new Command();
    this.stats = {
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      startTime: null,
      processedEmails: new Set(),
    };
    this.progressBar = null;
    this.checkpoint = {
      processedEmails: [],
      lastIndex: 0,
    };
  }

  /**
   * Initializes the CLI
   */
  setupCLI() {
    this.program
      .name('email-campaign-sender')
      .description('Professional bulk email campaign sender using Resend API')
      .version('1.0.0')
      .option('--mode <mode>', 'Mode: test (send to FROM_EMAIL) or live (send to all)', 'live')
      .option('--limit <number>', 'Maximum emails to send', (value) => parseInt(value, 10), 100)
      .option('--delay <number>', 'Milliseconds between emails', (value) => parseInt(value, 10), config.campaign.delayBetweenEmails)
      .option('--campaign <id>', 'Campaign identifier for tracking', `campaign_${Date.now()}`)
      .option('--contacts <path>', 'Path to CSV file', config.paths.defaultContacts)
      .option('--template <path>', 'Path to HTML template', config.paths.defaultTemplate)
      .option('--dry-run', 'Preview only, don\'t send emails', false)
      .option('--preview', 'Show rendered HTML for first contact', false)
      .option('--resume', 'Resume from last checkpoint', false);

    this.program.parse();
    return this.program.opts();
  }

  /**
   * Saves checkpoint for resume functionality
   */
  async saveCheckpoint(index) {
    this.checkpoint.lastIndex = index;
    try {
      await fs.writeFile(
        config.paths.checkpoint,
        JSON.stringify(this.checkpoint, null, 2)
      );
    } catch (error) {
      console.log(chalk.yellow(`⚠ Could not save checkpoint: ${error.message}`));
    }
  }

  /**
   * Loads checkpoint if exists
   */
  async loadCheckpoint() {
    try {
      if (existsSync(config.paths.checkpoint)) {
        const data = await fs.readFile(config.paths.checkpoint, 'utf-8');
        this.checkpoint = JSON.parse(data);
        return this.checkpoint;
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠ Could not load checkpoint: ${error.message}`));
    }
    return null;
  }

  /**
   * Clears checkpoint file
   */
  async clearCheckpoint() {
    try {
      if (existsSync(config.paths.checkpoint)) {
        await fs.unlink(config.paths.checkpoint);
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Asks user for confirmation
   */
  async confirm(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(chalk.yellow(`${question} (yes/no): `), (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }

  /**
   * Displays campaign summary before sending
   */
  async showSummary(contacts, options) {
    console.log(chalk.blue('\n📧 Email Campaign Summary:'));
    console.log(chalk.white('─'.repeat(50)));
    console.log(chalk.white(`Mode:          ${options.mode === 'test' ? chalk.yellow('TEST') : chalk.green('LIVE')}`));
    console.log(chalk.white(`Campaign ID:   ${options.campaign}`));
    console.log(chalk.white(`Template:      ${options.template}`));
    console.log(chalk.white(`Contacts:      ${contacts.length}`));
    console.log(chalk.white(`Limit:         ${options.limit}`));
    console.log(chalk.white(`Delay:         ${options.delay}ms`));
    console.log(chalk.white(`Daily Limit:   ${config.campaign.dailyLimit}`));
    console.log(chalk.white('─'.repeat(50)));

    // Get stats
    const stats = getContactStats(contacts);
    console.log(chalk.white(`\nContact Statistics:`));
    console.log(chalk.white(`  With Phone:   ${stats.withPhone}`));
    console.log(chalk.white(`  With Website: ${stats.withWebsite}`));
    console.log(chalk.white(`  Cities:       ${stats.cities.slice(0, 5).join(', ')}${stats.cities.length > 5 ? '...' : ''}`));
  }

  /**
   * Checks daily limit
   */
  async checkDailyLimit(plannedSends) {
    const todaysSent = await logger.getTodaysSentCount();
    const remaining = config.campaign.dailyLimit - todaysSent;

    console.log(chalk.white(`\n📊 Daily Limit Check:`));
    console.log(chalk.white(`  Sent today:   ${todaysSent}`));
    console.log(chalk.white(`  Daily limit:  ${config.campaign.dailyLimit}`));
    console.log(chalk.white(`  Remaining:    ${remaining}`));

    if (remaining <= 0) {
      console.log(chalk.red('\n❌ Daily limit reached! Cannot send more emails today.'));
      return false;
    }

    if (plannedSends > remaining) {
      console.log(chalk.yellow(`\n⚠ Warning: You can only send ${remaining} more emails today.`));
      const proceed = await this.confirm(`Reduce send count to ${remaining} and continue?`);
      if (proceed) {
        return remaining;
      }
      return false;
    }

    return true;
  }

  /**
   * Processes a single contact
   */
  async processContact(contact, options) {
    // Check if already processed in this run
    if (this.stats.processedEmails.has(contact.email.toLowerCase())) {
      this.stats.skipped++;
      await logger.logSkipped({
        recipient_email: contact.email,
        company_name: contact.company,
        error_message: 'Duplicate in current batch',
        campaign_id: options.campaign,
        template_used: options.template,
      });
      return { success: false, skipped: true };
    }

    // Check if already sent today
    const sentToday = await logger.wasEmailSentToday(contact.email);
    if (sentToday) {
      this.stats.skipped++;
      await logger.logSkipped({
        recipient_email: contact.email,
        company_name: contact.company,
        error_message: 'Already sent today',
        campaign_id: options.campaign,
        template_used: options.template,
      });
      return { success: false, skipped: true };
    }

    // Mark as processed
    this.stats.processedEmails.add(contact.email.toLowerCase());

    // Send email
    const result = await emailSender.sendToContact({
      contact,
      templatePath: options.template,
      campaignId: options.campaign,
      mode: options.mode,
    });

    if (result.success) {
      this.stats.sent++;
      console.log(chalk.green(`  ✓ Sent to ${contact.email} (${contact.company || 'Unknown'})`));
    } else {
      this.stats.failed++;
      console.log(chalk.red(`  ✗ Failed to ${contact.email}: ${result.error}`));
    }

    return result;
  }

  /**
   * Runs the campaign
   */
  async runCampaign(contacts, options) {
    this.stats.startTime = Date.now();
    this.stats.total = Math.min(contacts.length, options.limit);

    // Create progress bar
    this.progressBar = new cliProgress.SingleBar({
      format: chalk.cyan('{bar}') + ' {percentage}% | {value}/{total} | ETA: {eta_formatted}',
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
    });

    console.log(chalk.blue('\n🚀 Starting campaign...\n'));
    this.progressBar.start(this.stats.total, 0);

    // Process contacts
    let startIndex = 0;
    if (options.resume) {
      const checkpoint = await this.loadCheckpoint();
      if (checkpoint) {
        startIndex = checkpoint.lastIndex;
        this.stats.processedEmails = new Set(checkpoint.processedEmails);
        console.log(chalk.yellow(`\n📍 Resuming from contact #${startIndex + 1}`));
      }
    }

    for (let i = startIndex; i < contacts.length && i < options.limit; i++) {
      const contact = contacts[i];

      // Process contact
      await this.processContact(contact, options);

      // Update progress
      this.progressBar.update(i + 1);

      // Save checkpoint every N emails
      if ((i + 1) % config.checkpoint.saveInterval === 0) {
        this.checkpoint.processedEmails = Array.from(this.stats.processedEmails);
        await this.saveCheckpoint(i + 1);
      }

      // Delay before next send
      if (i < contacts.length - 1 && i < options.limit - 1) {
        await emailSender.sleep(options.delay);
      }
    }

    this.progressBar.stop();
    await this.clearCheckpoint();
  }

  /**
   * Shows final report
   */
  showReport(options) {
    const duration = Date.now() - this.stats.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    const avgTime = this.stats.total > 0 ? (duration / this.stats.total / 1000).toFixed(2) : 0;

    console.log(chalk.blue('\n\n📊 Campaign Report:'));
    console.log(chalk.white('═'.repeat(50)));
    console.log(chalk.white(`Campaign:      ${options.campaign}`));
    console.log(chalk.white(`Total:         ${this.stats.total}`));
    console.log(chalk.green(`✓ Sent:        ${this.stats.sent} (${((this.stats.sent / this.stats.total) * 100).toFixed(1)}%)`));
    console.log(chalk.red(`✗ Failed:      ${this.stats.failed} (${((this.stats.failed / this.stats.total) * 100).toFixed(1)}%)`));
    console.log(chalk.yellow(`⊘ Skipped:     ${this.stats.skipped} (${((this.stats.skipped / this.stats.total) * 100).toFixed(1)}%)`));
    console.log(chalk.white(`Time:          ${minutes}m ${seconds}s`));
    console.log(chalk.white(`Avg:           ${avgTime}s per email`));
    console.log(chalk.white('═'.repeat(50)));
  }

  /**
   * Main execution
   */
  async run() {
    try {
      console.log(chalk.blue.bold('\n📨 Email Campaign Sender v1.0.0\n'));

      // Parse CLI options
      const options = this.setupCLI();

      // Validate configuration
      validateConfig();

      // Validate template
      console.log(chalk.white('📋 Validating template...'));
      const templateValidation = await emailSender.validateTemplate(options.template);
      if (!templateValidation.valid) {
        throw new Error(`Invalid template: ${templateValidation.error}`);
      }
      console.log(chalk.green('✓ Template valid\n'));

      // Validate and read CSV
      console.log(chalk.white('📂 Reading contacts...'));
      await validateCsvFile(options.contacts);
      const contacts = await readContacts(options.contacts);

      if (contacts.length === 0) {
        throw new Error('No valid contacts found in CSV file');
      }

      console.log(chalk.green(`✓ Loaded ${contacts.length} contacts\n`));

      // Preview mode
      if (options.preview) {
        console.log(chalk.blue('👁 Preview Mode\n'));
        const preview = await emailSender.preview(contacts[0], options.template);
        console.log(chalk.white('To:'), preview.to);
        console.log(chalk.white('Subject:'), preview.subject);
        console.log(chalk.white('Contact Data:'), JSON.stringify(preview.contact, null, 2));
        console.log(chalk.white('\nHTML Preview (first 500 chars):'));
        console.log(preview.html.substring(0, 500) + '...');
        return;
      }

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.blue('🔍 Dry Run Mode - No emails will be sent\n'));
        await this.showSummary(contacts.slice(0, options.limit), options);
        console.log(chalk.green('\n✓ Dry run complete. Everything looks good!'));
        return;
      }

      // Show summary
      await this.showSummary(contacts.slice(0, options.limit), options);

      // Check daily limit
      const limitCheck = await this.checkDailyLimit(Math.min(contacts.length, options.limit));
      if (limitCheck === false) {
        return;
      } else if (typeof limitCheck === 'number') {
        options.limit = limitCheck;
      }

      // Confirm in live mode
      if (options.mode === 'live') {
        const proceed = await this.confirm(`\nReady to send ${Math.min(contacts.length, options.limit)} emails?`);
        if (!proceed) {
          console.log(chalk.yellow('\n⊘ Campaign cancelled'));
          return;
        }
      } else {
        console.log(chalk.yellow('\n⚠ TEST MODE: All emails will be sent to ' + config.resend.fromEmail));
      }

      // Run campaign
      await this.runCampaign(contacts, options);

      // Show report
      this.showReport(options);

      console.log(chalk.green('\n✨ Campaign completed successfully!\n'));
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n⊘ Campaign interrupted by user'));
  process.exit(0);
});

// Run the application
const app = new EmailCampaignSender();
app.run();
