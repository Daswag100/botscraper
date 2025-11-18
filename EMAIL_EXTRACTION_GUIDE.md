# Email Extraction Feature Guide

## Overview
The Google Maps scraper has been enhanced with automated email extraction functionality. The scraper now:
- Saves ALL businesses (with or without websites)
- Automatically visits business websites
- Extracts email addresses from multiple sources
- Exports results with an "Email" column in CSV/JSON format

## New Features

### 1. Email Extraction Methods
The scraper uses multiple methods to find email addresses:

- **Method 1: mailto: links** - Extracts emails from `<a href="mailto:...">` links
- **Method 2: Text content** - Scans all visible text on the page
- **Method 3: HTML source** - Searches the raw HTML for email patterns
- **Method 4: Specific sections** - Focuses on footer, header, and contact sections

### 2. Contact Page Detection
The scraper automatically tries common contact page URLs:
- `/contact`
- `/contact-us`
- `/contactus`
- `/about`
- `/about-us`
- `/aboutus`
- And variations with `.html` extension

### 3. Error Handling & Retry Logic
- **Automatic retries**: 2 retry attempts per website by default
- **Timeout protection**: 20-second timeout per site
- **Graceful failures**: Continues scraping even if some websites fail
- **Clear logging**: Shows progress for each business and website visit

### 4. CSV/JSON Export
Results are exported with the following columns:
- Business Name
- Rating
- Review Count
- Address
- Phone
- Website
- **Email** (NEW!)
- Service Type
- Search Location
- Google Maps URL
- Extracted At

## Usage

### Basic Usage
```javascript
const scraper = new ServiceBusinessLeadScraper();

await scraper.init();

const businesses = await scraper.getBusinessesInAreaExpanded(
  'plumbers',
  'Phoenix',
  'Arizona',
  {
    minReviews: 2,
    maxBusinesses: 10,
    minStars: 1.0,
    maxStars: 4.1,
    extractEmails: true  // Enable email extraction
  }
);

// Export to CSV with email column
scraper.exportToCSV(businesses, 'my_leads.csv');

// Export to JSON
scraper.exportToJSON(businesses, 'my_leads.json');

await scraper.close();
```

### Running the Test
```bash
node scraper.js
```

This will:
1. Search for plumbers in Phoenix, Arizona
2. Extract details from businesses with 1.0-4.1 star ratings
3. Visit their websites and extract emails
4. Save results to `./results/` folder in both CSV and JSON formats

## Configuration Options

### Email Extraction Options
```javascript
{
  extractEmails: true,      // Enable/disable email extraction
  maxBusinesses: 10,        // Maximum number of businesses to process
  minReviews: 2,            // Minimum review count
  minStars: 1.0,            // Minimum star rating
  maxStars: 4.1             // Maximum star rating
}
```

### Customizing Retry Logic
To change the number of retries, modify the `extractEmailFromWebsite` method:
```javascript
await this.extractEmailFromWebsite(websiteUrl, businessName, 3);  // 3 retries instead of 2
```

## Output Files

### CSV Format
Results are saved to `./results/` with columns:
```
Business Name,Rating,Review Count,Address,Phone,Website,Email,Service Type,Search Location,Google Maps URL,Extracted At
"ABC Plumbing",3.2,45,"123 Main St","555-1234","https://abcplumbing.com","contact@abcplumbing.com","plumbers","Phoenix, Arizona",...
```

### JSON Format
Results are saved with complete business data:
```json
[
  {
    "name": "ABC Plumbing",
    "rating": 3.2,
    "reviewCount": 45,
    "address": "123 Main St",
    "phone": "555-1234",
    "website": "https://abcplumbing.com",
    "email": "contact@abcplumbing.com",
    "serviceType": "plumbers",
    "searchLocation": "Phoenix, Arizona",
    "googleMapsUrl": "https://...",
    "extractedAt": "2025-11-18T..."
  }
]
```

## Console Output
The scraper provides detailed console output:

```
📊 Business #1: ABC Plumbing
   Rating: 3.2⭐ (45 reviews)
   🖱️  Clicking business to get details...
   📍 Clicked on business, waiting for details panel...
   🌐 Website: https://abcplumbing.com
   📞 Phone: 555-1234
   📍 Address: 123 Main St

   📧 Starting email extraction for ABC Plumbing...
   🌐 Visiting website: https://abcplumbing.com
   📡 Attempt 1/2: Loading website...
   ✅ Found 1 email(s) on main page: contact@abcplumbing.com
   ✅ EMAIL FOUND: contact@abcplumbing.com

✅ URGENT LEAD #1: ABC Plumbing (3.2⭐, 45 reviews)
   Email: contact@abcplumbing.com
   Status: SAVED TO RESULTS
```

## Behavior Changes

### OLD Behavior
- Skipped businesses WITH websites
- Only saved businesses WITHOUT websites
- No email extraction

### NEW Behavior
- Saves ALL businesses (with or without websites)
- Visits websites and extracts emails
- Includes email in CSV/JSON exports
- Detailed logging for each step

## Performance Considerations

### Timing
- **Basic info extraction**: ~2 seconds per business
- **Website visit + email extraction**: ~15-25 seconds per business
- **Total time for 10 businesses**: ~3-5 minutes

### Tips for Faster Scraping
1. Reduce `maxBusinesses` for testing
2. Set `extractEmails: false` if you don't need emails
3. Increase timeouts if websites are slow to load
4. Use headless mode for faster performance (optional)

## Troubleshooting

### No Emails Found
- Some websites don't display emails publicly
- Emails might be hidden behind forms or contact pages we don't check
- Some sites use JavaScript-only email displays

### Website Timeouts
- Increase timeout in `extractEmailFromWebsite`:
  ```javascript
  timeout: 30000  // 30 seconds instead of 20
  ```

### False Positives
The scraper filters out common false positives like:
- example.com
- test.com
- Image files (.png, .jpg, etc.)

Add more filters in `extractEmailsFromPage` if needed.

## Security & Best Practices

1. **Rate Limiting**: The scraper includes built-in delays to avoid being blocked
2. **User Agent**: Uses a real browser user agent
3. **Error Handling**: Continues scraping even if individual sites fail
4. **Data Privacy**: Only extracts publicly available information

## Next Steps

1. Test with different service types and locations
2. Adjust star rating ranges for your target audience
3. Export results and import into your CRM
4. Use the email addresses for outreach campaigns

## Support

For issues or questions:
1. Check the console output for detailed error messages
2. Review the code comments in scraper.js
3. Adjust timeout and retry settings as needed
