# 📧 Email Campaign Sender

Professional bulk email campaign sender built with Node.js and Resend API. Perfect for sending personalized emails to real estate companies, plumbers, solar installers, and other businesses.

## ✨ Features

- **Bulk Email Sending**: Send personalized emails to hundreds of contacts
- **Resend API Integration**: Reliable email delivery with built-in tracking
- **CSV Import**: Easy contact management via CSV files
- **Handlebars Templates**: Dynamic, professional HTML email templates
- **Rate Limiting**: Configurable delays between sends to avoid spam filters
- **Daily Limits**: Prevent exceeding sending quotas
- **Retry Logic**: Automatic retry with exponential backoff for failed sends
- **Detailed Logging**: Track every send with CSV logs
- **Progress Tracking**: Real-time progress bars and status updates
- **Test Mode**: Send test emails before going live
- **Dry Run**: Preview campaigns without sending
- **Checkpoint/Resume**: Automatically save progress and resume if interrupted
- **Duplicate Prevention**: Skip emails already sent today
- **Email Validation**: Verify email addresses before sending

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ installed
- **Resend Account** (free tier available at [resend.com](https://resend.com))

### Installation

1. **Navigate to the project directory:**

```bash
cd email-campaign-sender
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure environment variables:**

```bash
cp .env.example .env
```

Edit `.env` and add your Resend API key:

```env
RESEND_API_KEY=re_GDwYgXTX_9PxXY6AGFECwFHETCxbdiPXt
FROM_EMAIL=onboarding@resend.dev
FROM_NAME=Real Estate Opportunities
```

4. **Prepare your contacts CSV:**

Place your contacts file in the `data/` directory. See [CSV Format](#csv-format) below.

5. **Test the setup:**

```bash
npm test
# or
node index.js --mode test --limit 1
```

This sends 1 test email to your FROM_EMAIL address to verify everything works.

## 📊 CSV Format

Your CSV file should include these columns (flexible naming supported):

### Required Columns
- **Business Name** (or "Company", "Company Name")
- **Email** (or "Email Address", "E-mail")

### Optional Columns
- **Phone Number** (or "Phone", "Contact Phone")
- **Address** (or "Street Address", "Location Address")
- **Website** (or "Website URL", "URL")
- **Location** (or "City", "Area")
- **Business Type** (or "Type", "Category", "Industry")
- **Rating** (or "Google Rating", "Stars")
- **Reviews** (or "Review Count")
- **Google Maps Link** (or "Maps Link", "Map URL")

### Example CSV

```csv
Business Name,Email,Phone Number,Address,Location,Business Type,Website
Dallas Realty Group,contact@dallasrealty.com,(555) 123-4567,123 Main St,Dallas,Real Estate,https://dallasrealty.com
Smith Plumbing,info@smithplumbing.com,(555) 234-5678,456 Oak Ave,Houston,Plumbing,https://smithplumbing.com
```

**Notes:**
- Emails marked as "N/A" or empty will be skipped
- Invalid email addresses will be automatically filtered out
- The script handles missing optional fields gracefully

## 🎯 Usage Examples

### Test Mode (Send to yourself)

```bash
node index.js --mode test --limit 1
```

Sends test email to your FROM_EMAIL address with real data from first contact.

### Real Estate Campaign

```bash
node index.js \
  --mode live \
  --contacts data/realestate.csv \
  --template templates/realestate.html \
  --campaign "dallas_realty_nov2025" \
  --limit 50 \
  --delay 3000
```

### Plumbers Campaign

```bash
node index.js \
  --mode live \
  --contacts data/plumbers.csv \
  --template templates/plumbers.html \
  --campaign "houston_plumbers_nov2025"
```

**Remember to update FROM_NAME in .env:**

```env
FROM_NAME=Plumbing Project Leads
```

### Solar Campaign

```bash
node index.js \
  --mode live \
  --contacts data/solar.csv \
  --template templates/solar.html \
  --campaign "austin_solar_nov2025"
```

**Update FROM_NAME:**

```env
FROM_NAME=Solar Installation Opportunities
```

### Dry Run (Preview without sending)

```bash
node index.js --dry-run --contacts data/contacts.csv --limit 10
```

Shows what would be sent without actually sending emails.

### Preview First Email

```bash
node index.js --preview --contacts data/contacts.csv
```

Displays rendered HTML and subject for the first contact.

### Resume Interrupted Campaign

```bash
node index.js --resume --campaign "dallas_realty_nov2025"
```

Continues from last checkpoint if the script was interrupted.

## ⚙️ Configuration Options

### Command Line Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `--mode` | `test` or `live` | `live` |
| `--limit` | Max emails to send | `100` |
| `--delay` | Milliseconds between emails | `2000` |
| `--campaign` | Campaign identifier | `campaign_[timestamp]` |
| `--contacts` | Path to CSV file | `data/contacts.csv` |
| `--template` | Path to HTML template | `templates/realestate.html` |
| `--dry-run` | Preview only, don't send | `false` |
| `--preview` | Show rendered first email | `false` |
| `--resume` | Resume from checkpoint | `false` |

### Environment Variables (.env)

```env
# Resend API Configuration
RESEND_API_KEY=your_api_key_here
FROM_EMAIL=onboarding@resend.dev
FROM_NAME=Your Sender Name

# Campaign Settings
DAILY_LIMIT=100
DELAY_BETWEEN_EMAILS=2000

# URLs
UNSUBSCRIBE_URL=mailto:youremail@gmail.com?subject=Unsubscribe

# Tracking
ENABLE_TRACKING=true
```

## 📧 Email Templates

### Available Templates

1. **templates/realestate.html** - Real estate investment opportunities
2. **templates/plumbers.html** - Plumbing project leads
3. **templates/solar.html** - Solar installation opportunities

### Template Variables

All templates support these Handlebars variables:

```handlebars
{{firstName}}      - Extracted from Business Name or "there"
{{company}}        - Business Name
{{email}}          - Email address
{{phone}}          - Phone Number
{{address}}        - Street Address
{{website}}        - Website URL
{{city}}           - Location/City
{{trade}}          - Business Type
{{currentDate}}    - Current date (formatted)
{{unsubscribeUrl}} - Unsubscribe link
```

### Customizing Templates

1. Copy an existing template:

```bash
cp templates/realestate.html templates/mytemplate.html
```

2. Edit the HTML and subject line:

```html
<!-- SUBJECT: Your custom subject with {{firstName}} -->
<!DOCTYPE html>
<html>
...
</html>
```

3. Use your template:

```bash
node index.js --template templates/mytemplate.html
```

### Creating Industry-Specific Campaigns

For different industries, simply:

1. **Choose or create a template** for that industry
2. **Update FROM_NAME** in `.env` to match the industry
3. **Prepare industry-specific CSV** data
4. **Run the campaign** with appropriate template

Example for HVAC contractors:

```bash
# Update .env
FROM_NAME=HVAC Project Opportunities

# Run campaign
node index.js \
  --contacts data/hvac.csv \
  --template templates/hvac.html \
  --campaign "hvac_leads_nov2025"
```

## 📝 Logging

### Sent Log (logs/sent_log.csv)

Every email send is logged with:

- **timestamp** - When the email was sent
- **recipient_email** - Recipient address
- **company_name** - Company name
- **status** - `success`, `failed`, or `skipped`
- **resend_message_id** - Resend's tracking ID
- **error_message** - Error details if failed
- **retry_count** - Number of retry attempts
- **campaign_id** - Campaign identifier
- **template_used** - Template file path

### Tracking Opens and Clicks

Resend automatically tracks opens and clicks. View analytics at:

[https://resend.com/emails](https://resend.com/emails)

## 🛡️ Safety Features

### Daily Limit Protection

The script checks how many emails you've sent today and stops if you've reached your daily limit. Configure in `.env`:

```env
DAILY_LIMIT=100
```

### Duplicate Prevention

- **Within same run**: Tracks processed emails in memory
- **Across runs**: Checks logs to see if email was sent today
- **Skip duplicates**: Automatically logs as "skipped"

### Test Mode

Always test first with:

```bash
node index.js --mode test --limit 1
```

This sends to YOUR email address using real contact data.

### Retry Logic

Failed sends are automatically retried 3 times with exponential backoff:
- Attempt 1: Immediate
- Attempt 2: Wait 2 seconds
- Attempt 3: Wait 4 seconds
- Attempt 4: Wait 8 seconds

### Rate Limit Handling

If Resend returns a 429 (rate limit) error, the script automatically waits and retries.

## 📊 Campaign Reports

After each campaign, you'll see a detailed report:

```
📊 Campaign Report:
═══════════════════════════════════════════
Campaign:      dallas_realty_nov2025
Total:         100
✓ Sent:        85 (85.0%)
✗ Failed:      5 (5.0%)
⊘ Skipped:     10 (10.0%)
Time:          3m 45s
Avg:           2.25s per email
═══════════════════════════════════════════
```

## 🔧 Troubleshooting

### "Cannot read CSV file"

**Solution:** Check file path is correct and file exists:

```bash
ls data/contacts.csv
```

### "Invalid template"

**Solution:** Verify template file exists and has valid HTML:

```bash
node index.js --preview --template templates/realestate.html
```

### "RESEND_API_KEY is required"

**Solution:** Make sure you've created `.env` from `.env.example` and added your API key:

```bash
cp .env.example .env
# Edit .env and add your API key
```

### "Daily limit reached"

**Solution:** Wait until tomorrow or increase daily limit in `.env`:

```env
DAILY_LIMIT=200
```

### Emails going to spam

**Tips:**
1. **Verify your domain** with Resend for better deliverability
2. **Personalize content** - use {{firstName}} and {{company}}
3. **Slow down** - increase delay: `--delay 5000`
4. **Reduce batch size** - send fewer per day
5. **Warm up** - start with small batches and increase gradually
6. **Include unsubscribe link** - already included in templates
7. **Avoid spam words** - review your templates

### Script interrupted

**Solution:** Use resume functionality:

```bash
node index.js --resume --campaign "your_campaign_id"
```

Progress is automatically saved every 10 emails.

## 📈 Best Practices

### Email Deliverability

1. **Verify your domain** with Resend (better than using resend.dev)
2. **Warm up your domain** - start slow, increase volume gradually
3. **Personalize emails** - use recipient names and company info
4. **Segment your audience** - send relevant content
5. **Monitor bounce rates** - remove invalid emails
6. **Include unsubscribe** - always provide opt-out option
7. **Test first** - always use `--mode test` before going live

### Campaign Management

1. **Use descriptive campaign IDs**: `dallas_realty_nov2025` vs `campaign_12345`
2. **Keep CSV data clean**: Remove duplicates, validate emails
3. **Start small**: Test with 10-20 contacts first
4. **Monitor results**: Check Resend dashboard for opens/clicks
5. **Respect daily limits**: Don't try to bypass rate limits
6. **Review logs**: Check `logs/sent_log.csv` for issues

### Template Optimization

1. **Mobile-friendly**: All templates are responsive
2. **Clear CTA**: Include obvious call-to-action button
3. **Professional design**: Use consistent branding
4. **Short and focused**: Get to the point quickly
5. **Include value**: Explain what's in it for them

## 🔐 Security Notes

- **Never commit `.env`** - it's in `.gitignore`
- **Never commit real contact data** - add CSV files to `.gitignore`
- **Protect your API key** - don't share publicly
- **Rotate keys regularly** - create new keys periodically

## 📦 Project Structure

```
email-campaign-sender/
├── index.js              # Main CLI application
├── config.js             # Configuration management
├── emailSender.js        # Resend API integration
├── csvReader.js          # CSV parsing logic
├── logger.js             # Logging system
├── package.json          # Dependencies
├── .env.example          # Environment template
├── .gitignore            # Git ignore rules
├── README.md             # This file
├── templates/
│   ├── realestate.html   # Real estate template
│   ├── plumbers.html     # Plumbers template
│   └── solar.html        # Solar template
├── data/
│   └── contacts.csv      # Sample contacts (add your own)
└── logs/
    └── sent_log.csv      # Auto-generated send log
```

## 🤝 Support

For issues or questions:

1. Check this README thoroughly
2. Review logs in `logs/sent_log.csv`
3. Test with `--dry-run` or `--preview`
4. Check Resend documentation: [resend.com/docs](https://resend.com/docs)

## 📄 License

MIT License - feel free to use for your business!

## 🎉 Getting Started Checklist

- [ ] Install Node.js 18+
- [ ] Run `npm install`
- [ ] Create Resend account and get API key
- [ ] Copy `.env.example` to `.env`
- [ ] Add your `RESEND_API_KEY` to `.env`
- [ ] Prepare your contacts CSV file
- [ ] Run test: `npm test`
- [ ] Review rendered email
- [ ] Run dry-run: `node index.js --dry-run --limit 10`
- [ ] Send first real batch: `node index.js --mode live --limit 10`
- [ ] Monitor results in Resend dashboard
- [ ] Scale up gradually

---

**Ready to send your first campaign?**

```bash
# Test first
npm test

# Then go live
node index.js --mode live --limit 50
```

Good luck with your campaigns! 🚀
