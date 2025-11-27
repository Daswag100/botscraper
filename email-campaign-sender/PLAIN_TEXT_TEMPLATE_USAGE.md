# Plain Text Email Template Usage

## Overview
The email sender now supports **plain text templates** in addition to HTML templates. Plain text emails have better deliverability and appear more personal.

## New Template: `restaurant-cold-selfish.txt`

### Location
`templates/restaurant-cold-selfish.txt`

### Subject Line
```
{{company}} - I did something for you (selfish reasons)
```

### Features
- **Plain text format** for better deliverability
- **Selfish approach** messaging that's honest and disarming
- Uses actual rating data from CSV
- Personalized with business name, location, etc.

---

## How To Use Plain Text Templates

### 1. Setup Environment Variables

Add to your `.env` file:
```bash
GMAIL_EMAIL=your@gmail.com
GMAIL_APP_PASSWORD=your-app-password
FROM_NAME="Your Business Name"
SENDER_NAME="Your Full Name"  # NEW: Used in {{senderName}} variable
```

**Note:** `SENDER_NAME` is used for email signatures. Falls back to `FROM_NAME` if not set.

---

### 2. Send Plain Text Campaign

```bash
cd email-campaign-sender
node index.js \
  --csv ../restaurants_2.0-4.3_stars_[timestamp].csv \
  --template templates/restaurant-cold-selfish.txt \
  --delay 10000 \
  --limit 450 \
  --mode live
```

**Key Options:**
- `--template templates/restaurant-cold-selfish.txt` - Use plain text template
- `--delay 10000` - 10 seconds between emails (recommended for cold outreach)
- `--limit 450` - Gmail daily limit is 500, so 450 is safe
- `--mode test` - Test first! Sends to your email

---

### 3. Test First (Always!)

```bash
node index.js \
  --csv ../restaurants.csv \
  --template templates/restaurant-cold-selfish.txt \
  --mode test \
  --limit 3
```

This sends 3 test emails to **your Gmail address** so you can review how they look.

---

## Template Variables

The plain text template supports these variables:

| Variable | Source | Example |
|----------|--------|---------|
| `{{firstName}}` | Extracted from Business Name | "Joe" from "Joe's Pizza" |
| `{{company}}` | Business Name from CSV | "Joe's Pizza" |
| `{{city}}` | Location from CSV (before comma) | "Texas" from "Texas, USA" |
| `{{rating}}` | Rating from CSV | "3.5" |
| `{{reviews}}` | Reviews from CSV | "127 reviews" |
| `{{senderName}}` | SENDER_NAME env variable | "John Smith" |
| `{{senderEmail}}` | GMAIL_EMAIL env variable | "john@example.com" |

---

## Plain Text vs HTML Templates

### Plain Text Templates (.txt)
- **Better deliverability** - Less likely to hit spam
- **More personal** - Looks like a real person wrote it
- **Faster loading** - No images or styling
- Subject line: `SUBJECT: Your subject here` (first line)
- Body: Everything after the subject line

### HTML Templates (.html)
- **Professional appearance** - Branded styling
- **Visual elements** - Colors, images, buttons
- **Better for promotional content**
- Subject line: `<!-- SUBJECT: Your subject here -->`
- Body: Full HTML markup

---

## Creating Your Own Plain Text Templates

### Template Structure

```
SUBJECT: {{variable}} - Your subject line here

Hey {{firstName}},

Your email content here...

Variables work like this: {{company}}

Best regards,
{{senderName}}
{{senderEmail}}
```

### Rules
1. **First line** must be `SUBJECT: ...`
2. **Blank line** after subject
3. Use `{{variableName}}` for Handlebars variables
4. Keep it conversational and personal
5. Save with `.txt` extension

### Example

Create `templates/my-template.txt`:
```
SUBJECT: Quick question about {{company}}

Hi {{firstName}},

I noticed {{company}} has a {{rating}}⭐ rating...

Let me know if you'd like to chat.

Thanks,
{{senderName}}
```

Use it:
```bash
node index.js --template templates/my-template.txt --csv your-file.csv
```

---

## Recommended Settings for Cold Outreach

### Best Practices
- **Delay:** 10 seconds (`--delay 10000`)
- **Daily limit:** 450 emails max
- **Time of day:** 9 AM - 4 PM in recipient's timezone
- **Test first:** Always use `--mode test` before live

### Command
```bash
# Morning batch (9 AM - 12 PM)
node index.js \
  --template templates/restaurant-cold-selfish.txt \
  --csv morning_batch.csv \
  --delay 10000 \
  --limit 150 \
  --mode live

# Afternoon batch (1 PM - 4 PM)
node index.js \
  --template templates/restaurant-cold-selfish.txt \
  --csv afternoon_batch.csv \
  --delay 10000 \
  --limit 150 \
  --mode live
```

---

## Troubleshooting

### "Template not found"
- Make sure path is correct: `templates/restaurant-cold-selfish.txt`
- Use relative path from email-campaign-sender directory

### "SENDER_NAME not showing"
- Add `SENDER_NAME=Your Name` to `.env` file
- Restart the CLI after changing `.env`

### "Emails going to spam"
- Use longer delays: `--delay 15000` (15 seconds)
- Reduce daily volume: `--limit 200`
- Make sure `GMAIL_EMAIL` is verified
- Check Gmail "Sent" folder - if they're there, they were delivered

### "Plain text looks weird"
- Remove any HTML tags from template
- Use plain line breaks, not `<br>`
- Keep lines under 80 characters for readability

---

## Examples

### Test 3 Emails
```bash
node index.js \
  --template templates/restaurant-cold-selfish.txt \
  --csv restaurants.csv \
  --mode test \
  --limit 3
```

### Send to 50 Contacts (Conservative)
```bash
node index.js \
  --template templates/restaurant-cold-selfish.txt \
  --csv restaurants.csv \
  --delay 12000 \
  --limit 50 \
  --mode live
```

### Maximum Daily Batch
```bash
node index.js \
  --template templates/restaurant-cold-selfish.txt \
  --csv restaurants.csv \
  --delay 10000 \
  --limit 450 \
  --mode live
```

---

## Template Performance

### Expected Results
- **Open rate:** 30-45% (plain text performs better than HTML for cold email)
- **Response rate:** 2-5% (with good targeting)
- **Spam rate:** <1% (with proper delays and volume)

### Optimization Tips
1. Use recipient's actual data (`{{rating}}`, `{{city}}`)
2. Keep subject lines under 50 characters
3. Front-load the value proposition
4. Include clear call-to-action
5. Test different subject lines

---

## Support

For issues or questions:
1. Check Gmail app password is correct
2. Verify `.env` file has all required variables
3. Test with `--mode test` first
4. Check `logs/` directory for error details
