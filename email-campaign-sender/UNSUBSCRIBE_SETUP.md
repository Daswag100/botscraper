# Unsubscribe Functionality

This email sender now includes comprehensive unsubscribe functionality that allows recipients to opt-out of future emails.

## Features

✅ **Unique unsubscribe tokens** - Each email gets a unique, secure token
✅ **Beautiful unsubscribe page** - Professional UI with confirmation flow
✅ **Automatic filtering** - Emails are automatically skipped for unsubscribed addresses
✅ **CSV-based storage** - No database required, uses simple CSV files
✅ **Detailed logging** - Tracks IP address, user agent, and timestamp
✅ **Statistics API** - View unsubscribe metrics and trends

## Setup

### 1. Update Your .env File

Add the base URL for your application:

```bash
BASE_URL=https://yourdomain.com
# Or for local testing:
BASE_URL=http://localhost:3000
```

### 2. Deploy Your Application

Make sure your application is accessible at the BASE_URL you configured. The unsubscribe links will use this URL.

### 3. Email Templates

All email templates now automatically include unsubscribe links:

- **HTML templates**: Include `{{unsubscribeUrl}}` in footer (already configured)
- **Text templates**: Include `{{unsubscribeLink}}` at bottom (already configured)

## How It Works

### For Each Email Sent

1. A unique token is generated for the recipient's email address
2. An unsubscribe URL is created: `{BASE_URL}/api/unsubscribe/{token}`
3. The URL is injected into the email template as `{{unsubscribeLink}}` or `{{unsubscribeUrl}}`
4. Before sending, the system checks if the email has unsubscribed

### When Someone Unsubscribes

1. User clicks the unsubscribe link in their email
2. They're shown a confirmation page with their email address
3. They click "Unsubscribe" to confirm
4. Their email is added to the unsubscribe list
5. A success message is displayed

### Data Storage

The system creates two CSV files in the `logs/` directory:

**logs/unsubscribes.csv**
- Stores all unsubscribe events
- Columns: `timestamp`, `email`, `token`, `ip_address`, `user_agent`

**logs/unsubscribe_tokens.csv**
- Maps tokens to email addresses
- Columns: `token`, `email`, `created_at`, `campaign_id`

## API Endpoints

### GET /api/unsubscribe/:token
Serves the unsubscribe confirmation page

### GET /api/unsubscribe/:token/info
Returns email address for a given token (JSON)

### POST /api/unsubscribe/:token
Processes the unsubscribe request (JSON)

### GET /api/unsubscribe/stats
Returns unsubscribe statistics (JSON)

## Testing

### Test the Unsubscribe Flow

1. Start the server:
   ```bash
   npm start
   ```

2. Send a test email to yourself:
   - Use the web interface at http://localhost:3000
   - Click "Send Test Email"

3. Check your email for the unsubscribe link

4. Click the unsubscribe link and confirm

5. Try sending another email - it should be skipped

### Check Unsubscribe Statistics

```bash
curl http://localhost:3000/api/unsubscribe/stats
```

## Campaign Behavior

When running a campaign, the system will:

1. ✅ Check if email was already sent today (existing feature)
2. ✅ Check if email is a duplicate in the batch (existing feature)
3. ✅ **NEW:** Check if email has unsubscribed
4. ✅ Skip sending if any of the above are true
5. ✅ Log the skip reason in campaign logs

Skipped emails show up in campaign statistics:
- Campaign logs show "skipped" status
- Progress tracker shows skipped count
- Reason is logged (e.g., "Unsubscribed")

## Example Email Footer

### HTML Template
```html
<div class="footer">
    <p style="margin-top: 20px;">
        <a href="{{unsubscribeUrl}}" class="unsubscribe">
            Unsubscribe from future emails
        </a>
    </p>
</div>
```

### Text Template
```
---
Not interested? Unsubscribe: {{unsubscribeLink}}
```

## Security Features

- **Unique tokens**: Each email gets a unique SHA-256 token
- **No email exposure**: Tokens don't reveal email addresses
- **IP logging**: Tracks who unsubscribed (for abuse detection)
- **No authentication**: One-click unsubscribe (CAN-SPAM compliant)

## Compliance

This implementation follows email marketing best practices:

✅ **CAN-SPAM Act compliant** - One-click unsubscribe
✅ **GDPR friendly** - Easy opt-out mechanism
✅ **Permanent opt-out** - Unsubscribes are persistent
✅ **Clear identification** - Email address shown before unsubscribe

## Troubleshooting

### Unsubscribe link shows localhost

Update your `BASE_URL` in the `.env` file to your production domain:

```bash
BASE_URL=https://yourdomain.com
```

### Email still being sent to unsubscribed address

Check the unsubscribe list:

```bash
curl http://localhost:3000/api/unsubscribe/stats
```

Verify the email is in the list. The check is case-insensitive.

### Want to re-subscribe an email?

Currently, you need to manually edit `logs/unsubscribes.csv` and remove the line with that email address. A re-subscribe API endpoint can be added if needed.

## Future Enhancements

Potential additions:
- [ ] Re-subscribe API endpoint
- [ ] Export unsubscribe list
- [ ] Bulk unsubscribe import
- [ ] Unsubscribe reason collection
- [ ] Email preference center
- [ ] Category-specific unsubscribes

## Support

For issues or questions, check the campaign logs:
- `logs/sent_log.csv` - All sent/failed emails
- `logs/unsubscribes.csv` - All unsubscribe events
- Campaign status API: `/api/campaign/status`
