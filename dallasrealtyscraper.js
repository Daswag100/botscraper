// Enhanced Google Maps Scraper with Stealth Mode & Graceful Exit
// Features: Progressive scrolling, Ctrl+C handling, anti-bot detection

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Configure your search parameters
const locations = [
  'Dallas, Usa',
  'Houston, Usa',
  // Add more locations as needed
];

const businessTypes = ['real estate'];

const results = [];
let isGracefulShutdown = false;

// Maximum number of leads to scrape
const MAX_LEADS = 100;

// Handle Ctrl+C gracefully - save data before exiting
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Ctrl+C detected! Saving data before exit...\n');
  isGracefulShutdown = true;
  saveToCsv();
  console.log('\n✅ Data saved successfully. Exiting...\n');
  process.exit(0);
});

// Random delay function for more human-like behavior
async function randomDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractEmailFromWebsite(page, websiteUrl) {
  if (!websiteUrl) return null;

  // Contact page paths to try in order
  const contactPaths = ['', '/contact', '/contact-us', '/get-in-touch', '/about', '/about-us'];
  const maxRetries = 2;

  // Helper function to extract email from current page with improved detection
  const extractEmailFromCurrentPage = async (pageName) => {
    try {
      // Scroll to bottom to load lazy content and access footer sections
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      console.log(`      Scrolled to footer on ${pageName}`);

      // Wait for lazy-loaded content to render
      await randomDelay(2000, 3000);

      // Extract email with comprehensive selectors
      const email = await page.evaluate(() => {
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;

        // Priority 1: Check mailto links (most reliable)
        const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
        if (mailtoLinks.length > 0) {
          const email = mailtoLinks[0].getAttribute('href').replace('mailto:', '').split('?')[0].trim();
          return { email, source: 'mailto link' };
        }

        // Priority 2: Check footer sections specifically (MOST COMMON location)
        const footerSections = document.querySelectorAll('footer, [class*="footer" i], [id*="footer" i]');
        for (const footer of footerSections) {
          // Check for mailto in footer
          const footerMailto = footer.querySelector('a[href^="mailto:"]');
          if (footerMailto) {
            const email = footerMailto.getAttribute('href').replace('mailto:', '').split('?')[0].trim();
            return { email, source: 'footer mailto' };
          }

          // Check footer text content
          const footerText = footer.innerText || footer.textContent || '';
          const footerMatch = footerText.match(emailRegex);
          if (footerMatch) {
            const validEmail = footerMatch.find(e =>
              !e.includes('example.com') &&
              !e.includes('test.com') &&
              !e.includes('sentry.') &&
              !e.includes('noreply') &&
              !e.includes('wixpress.') &&
              !e.includes('placeholder')
            );
            if (validEmail) return { email: validEmail, source: 'footer text' };
          }

          // Check aria-label in footer elements
          const footerElements = footer.querySelectorAll('[aria-label*="@"], [aria-label*="email" i], [aria-label*="mail" i]');
          for (const el of footerElements) {
            const ariaLabel = el.getAttribute('aria-label');
            const ariaMatch = ariaLabel.match(emailRegex);
            if (ariaMatch) {
              return { email: ariaMatch[0], source: 'footer aria-label' };
            }
          }
        }

        // Priority 3: Check header/nav sections
        const headerSections = document.querySelectorAll('header, nav, [class*="header" i], [class*="nav" i], [id*="header" i], [id*="nav" i]');
        for (const header of headerSections) {
          const headerMailto = header.querySelector('a[href^="mailto:"]');
          if (headerMailto) {
            const email = headerMailto.getAttribute('href').replace('mailto:', '').split('?')[0].trim();
            return { email, source: 'header mailto' };
          }

          const headerText = header.innerText || header.textContent || '';
          const headerMatch = headerText.match(emailRegex);
          if (headerMatch) {
            const validEmail = headerMatch.find(e =>
              !e.includes('example.com') &&
              !e.includes('test.com') &&
              !e.includes('sentry.') &&
              !e.includes('noreply') &&
              !e.includes('wixpress.') &&
              !e.includes('placeholder')
            );
            if (validEmail) return { email: validEmail, source: 'header text' };
          }
        }

        // Priority 4: Check data attributes
        const elementsWithData = document.querySelectorAll('[data-email], [data-mail]');
        for (const el of elementsWithData) {
          const dataEmail = el.getAttribute('data-email') || el.getAttribute('data-mail');
          if (dataEmail && emailRegex.test(dataEmail)) {
            return { email: dataEmail, source: 'data attribute' };
          }
        }

        // Priority 5: Check aria-label attributes across the page
        const elementsWithAria = document.querySelectorAll('[aria-label]');
        for (const el of elementsWithAria) {
          const ariaLabel = el.getAttribute('aria-label');
          const ariaMatch = ariaLabel.match(emailRegex);
          if (ariaMatch) {
            return { email: ariaMatch[0], source: 'aria-label' };
          }
        }

        // Priority 6: Check buttons with "contact", "talk", "connect" text
        const contactButtons = document.querySelectorAll('button, a, [role="button"]');
        for (const btn of contactButtons) {
          const text = (btn.innerText || '').toLowerCase();
          if (text.includes('contact') || text.includes('talk') || text.includes('connect') || text.includes('email')) {
            const btnText = btn.innerText || btn.textContent || '';
            const btnMatch = btnText.match(emailRegex);
            if (btnMatch) {
              const validEmail = btnMatch.find(e =>
                !e.includes('example.com') &&
                !e.includes('test.com') &&
                !e.includes('sentry.') &&
                !e.includes('noreply') &&
                !e.includes('wixpress.') &&
                !e.includes('placeholder')
              );
              if (validEmail) return { email: validEmail, source: 'contact button' };
            }
          }
        }

        // Priority 7: Check entire page content as last resort
        const bodyText = document.body.innerText || document.body.textContent || '';
        const emailMatches = bodyText.match(emailRegex);

        if (emailMatches && emailMatches.length > 0) {
          const validEmails = emailMatches.filter(e =>
            !e.includes('example.com') &&
            !e.includes('test.com') &&
            !e.includes('sentry.') &&
            !e.includes('noreply') &&
            !e.includes('wixpress.') &&
            !e.includes('placeholder')
          );

          if (validEmails.length > 0) {
            return { email: validEmails[0], source: 'page body' };
          }
        }

        return null;
      });

      return email;
    } catch (error) {
      console.log(`      Error extracting from ${pageName}: ${error.message}`);
      return null;
    }
  };

  // Try each contact path in order
  for (const path of contactPaths) {
    const url = websiteUrl + path;
    const pageName = path === '' ? 'homepage' : path;

    // Retry logic for network failures
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        console.log(`    Attempting: ${url}${retry > 0 ? ` (retry ${retry + 1}/${maxRetries})` : ''}`);

        // Navigate to the page with increased timeout
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 25000
        });
        await randomDelay(2000, 3000);

        // Try to extract email from this page
        const result = await extractEmailFromCurrentPage(pageName);

        if (result && result.email) {
          console.log(`    ✓ FOUND EMAIL: ${result.email} (from ${pageName} - ${result.source})`);
          return result.email;
        } else {
          console.log(`      No email found on ${pageName}`);
        }

        // If successful navigation, don't retry this page
        break;
      } catch (error) {
        if (retry < maxRetries - 1) {
          console.log(`      Failed to load ${pageName}, retrying...`);
          await randomDelay(1000, 2000);
        } else {
          console.log(`      Could not access ${pageName}: ${error.message}`);
        }
      }
    }

    // If we found an email on any page, return it immediately
    // (This is handled by the return statement above, but adding check for clarity)
  }

  console.log(`    ✗ No email found after checking all pages`);
  return null;
}

// Enhanced scrolling function to load more businesses
async function progressiveScroll(page, targetBusinesses = 100) {
  console.log(`\n📜 Progressive scrolling to load up to ${targetBusinesses} businesses...`);

  let previousCount = 0;
  let currentCount = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 30; // Increased for more results
  let noNewResultsCount = 0;

  while (scrollAttempts < maxScrollAttempts && noNewResultsCount < 3) {
    // Check if Ctrl+C was pressed
    if (isGracefulShutdown) {
      console.log('⚠️  Stopping scroll due to graceful shutdown...');
      break;
    }

    scrollAttempts++;

    // Scroll the results panel
    await page.evaluate(() => {
      const feedDiv = document.querySelector('div[role="feed"]');
      if (feedDiv) {
        feedDiv.scrollBy(0, 800);
      }
    });

    // Wait for new content to load (random delay for human-like behavior)
    await randomDelay(2000, 4000);

    // Count current businesses
    currentCount = await page.evaluate(() => {
      const feedDiv = document.querySelector('div[role="feed"]');
      if (!feedDiv) return 0;
      const links = feedDiv.querySelectorAll('a[href*="/maps/place/"]');
      return links.length;
    });

    console.log(`Scroll ${scrollAttempts}: Found ${currentCount} businesses (target: ${targetBusinesses})`);

    // Check if we got new results
    if (currentCount === previousCount) {
      noNewResultsCount++;
      console.log(`⚠️  No new results (${noNewResultsCount}/3)`);

      // Try scrolling to the end to trigger more loading
      await page.evaluate(() => {
        const feedDiv = document.querySelector('div[role="feed"]');
        if (feedDiv) {
          feedDiv.scrollTop = feedDiv.scrollHeight;
        }
      });
      await randomDelay(3000, 5000);
    } else {
      noNewResultsCount = 0; // Reset counter if we found new results
    }

    previousCount = currentCount;

    // Stop if we have enough businesses
    if (currentCount >= targetBusinesses) {
      console.log(`✅ Reached target of ${targetBusinesses} businesses!`);
      break;
    }
  }

  console.log(`\n✅ Scrolling complete! Found ${currentCount} total businesses\n`);
  return currentCount;
}

async function scrapeGoogleMaps() {
  // Launch browser with stealth mode and anti-detection settings
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080',
      // Additional anti-detection args
      '--disable-infobars',
      '--disable-extensions',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--disable-accelerated-jpeg-decoding',
      '--disable-accelerated-mjpeg-decode',
      '--disable-app-list-dismiss-on-blur',
      '--disable-accelerated-video-decode',
    ]
  });

  const page = await browser.newPage();

  // Set viewport
  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1
  });

  // Set realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Set additional headers to appear more human
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
  });

  // Override navigator properties to avoid detection
  await page.evaluateOnNewDocument(() => {
    // Remove webdriver flag
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Add chrome object
    window.chrome = {
      runtime: {},
    };

    // Mock permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  for (const location of locations) {
    for (const businessType of businessTypes) {
      // Check if we've reached the maximum number of leads
      if (results.length >= MAX_LEADS) {
        console.log(`\n🎯 Reached maximum of ${MAX_LEADS} leads! Stopping...`);
        await browser.close();
        saveToCsv();
        return;
      }

      // Check if Ctrl+C was pressed
      if (isGracefulShutdown) {
        console.log('⚠️  Graceful shutdown in progress...');
        break;
      }

      const searchQuery = `${businessType} in ${location}`;
      console.log(`\n========================================`);
      console.log(`Searching: ${searchQuery}`);
      console.log(`Progress: ${results.length}/${MAX_LEADS} leads`);
      console.log(`========================================`);

      try {
        console.log('Loading Google Maps...');
        await page.goto('https://www.google.com/maps', {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        console.log('✓ Google Maps loaded');
        await randomDelay(4000, 6000);

        console.log('Finding search box...');
        // Clear search box and search
        const searchBox = await page.waitForSelector('#searchboxinput', { timeout: 15000 });
        await searchBox.click({ clickCount: 3 });
        await randomDelay(500, 1000);

        console.log(`Typing search query: ${searchQuery}`);
        // Type with random delays between keystrokes (more human-like)
        await searchBox.type(searchQuery, { delay: Math.floor(Math.random() * 100) + 50 });
        await randomDelay(1000, 2000);

        console.log('Pressing Enter to search...');
        await page.keyboard.press('Enter');

        console.log('Waiting for results to load...');
        await randomDelay(5000, 7000);

        // Wait for the results panel - try multiple selectors
        let resultsFound = false;
        const selectors = [
          'div[role="feed"]',
          'div.m6QErb.DxyBCb.kA9KIf.dS8AEf',
          'div[class*="feed"]',
          'div.m6QErb'
        ];

        for (const selector of selectors) {
          try {
            console.log(`Trying selector: ${selector}`);
            await page.waitForSelector(selector, { timeout: 20000 });
            console.log(`✓ Results panel found with selector: ${selector}`);
            resultsFound = true;
            break;
          } catch (e) {
            console.log(`✗ Selector ${selector} not found, trying next...`);
          }
        }

        if (!resultsFound) {
          console.log('⚠️  No results panel found with any selector');
          console.log('Waiting 10 more seconds to see if content loads...');
          await randomDelay(10000, 12000);

          // One more attempt
          try {
            await page.waitForSelector('div[role="feed"]', { timeout: 10000 });
            console.log('✓ Results panel loaded after extended wait');
            resultsFound = true;
          } catch (e) {
            console.log('✗ Still no results panel found after extended wait');

            // Take a screenshot for debugging
            await page.screenshot({ path: 'debug_no_results.png' });
            console.log('📸 Screenshot saved to debug_no_results.png');

            console.log('Skipping to next search...');
            continue;
          }
        }

        // Progressive scrolling to load more businesses (up to MAX_LEADS)
        const remainingLeads = MAX_LEADS - results.length;
        await progressiveScroll(page, Math.min(remainingLeads, 100));

        // Get all business link elements
        const businesses = await page.evaluate(() => {
          const links = [];
          const feedDiv = document.querySelector('div[role="feed"]');
          if (!feedDiv) return [];

          const allLinks = feedDiv.querySelectorAll('a[href*="/maps/place/"]');
          allLinks.forEach((link, index) => {
            const href = link.getAttribute('href');
            if (href && href.includes('/maps/place/')) {
              links.push({ href, index });
            }
          });

          return links;
        });

        console.log(`Found ${businesses.length} business links`);

        if (businesses.length === 0) {
          console.log('No businesses found, moving to next search');
          continue;
        }

        // Visit each business page directly
        const uniqueBusinesses = [...new Map(businesses.map(b => [b.href, b])).values()];

        // Limit to remaining leads or all found businesses, whichever is smaller
        const businessesToScrape = Math.min(uniqueBusinesses.length, MAX_LEADS - results.length);

        for (let i = 0; i < businessesToScrape; i++) {
          // Check if Ctrl+C was pressed
          if (isGracefulShutdown) {
            console.log('⚠️  Graceful shutdown in progress...');
            break;
          }

          try {
            const businessUrl = uniqueBusinesses[i].href;

            // Convert relative URL to absolute if needed
            const fullUrl = businessUrl.startsWith('http')
              ? businessUrl
              : `https://www.google.com${businessUrl}`;

            console.log(`\nChecking business ${i + 1}/${businessesToScrape}...`);

            // Navigate directly to the business page
            await page.goto(fullUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 30000
            });
            await randomDelay(4000, 6000); // Random delay for human-like behavior

            // Extract business details
            const details = await page.evaluate(() => {
              const data = {};

              // Get business name - try multiple selectors
              let name = null;
              const nameSelectors = [
                'h1.DUwDvf',
                'h1.fontHeadlineLarge',
                'h1[class*="fontHeadline"]',
                'div[class*="fontHeadline"]'
              ];

              for (const selector of nameSelectors) {
                const nameEl = document.querySelector(selector);
                if (nameEl && nameEl.innerText) {
                  name = nameEl.innerText.trim();
                  break;
                }
              }
              data.name = name;

              // Get phone number - multiple approaches
              let phone = null;

              // Method 1: Look for phone button
              const phoneButtons = document.querySelectorAll('button[data-item-id^="phone"]');
              if (phoneButtons.length > 0) {
                const ariaLabel = phoneButtons[0].getAttribute('aria-label');
                if (ariaLabel) {
                  phone = ariaLabel.replace('Phone:', '').replace('Copy phone number', '').trim();
                }
              }

              // Method 2: Look for phone in text
              if (!phone) {
                const allButtons = document.querySelectorAll('button');
                for (const btn of allButtons) {
                  const text = btn.innerText;
                  const phoneRegex = /(\+?\d{1,4}[\s-]?)?\(?\d{3,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/;
                  if (phoneRegex.test(text)) {
                    phone = text.trim();
                    break;
                  }
                }
              }

              data.phone = phone;

              // Get address
              const addressButton = document.querySelector('button[data-item-id="address"]');
              if (addressButton) {
                const ariaLabel = addressButton.getAttribute('aria-label');
                data.address = ariaLabel ? ariaLabel.replace('Address: ', '').trim() : null;
              } else {
                data.address = null;
              }

              // Get rating
              const ratingSelectors = [
                'div.F7nice span[aria-hidden="true"]',
                'span[aria-label*="stars"]',
                'div[jsaction*="rating"]'
              ];

              for (const selector of ratingSelectors) {
                const ratingEl = document.querySelector(selector);
                if (ratingEl && ratingEl.innerText) {
                  data.rating = ratingEl.innerText.trim();
                  break;
                }
              }

              // Get reviews count
              const reviewsEl = document.querySelector('div.F7nice span[aria-label]');
              if (reviewsEl) {
                const ariaLabel = reviewsEl.getAttribute('aria-label');
                data.reviews = ariaLabel;
              } else {
                data.reviews = null;
              }

              // Extract website URL
              let websiteUrl = null;

              // Method 1: Check for website button/link with data-item-id
              const websiteButton = document.querySelector('a[data-item-id="authority"]');
              if (websiteButton) {
                websiteUrl = websiteButton.getAttribute('href');
              }

              // Method 2: Look for "Website" text in links
              if (!websiteUrl) {
                const allLinks = document.querySelectorAll('a');
                for (const link of allLinks) {
                  const ariaLabel = link.getAttribute('aria-label');
                  const text = link.innerText;
                  if ((ariaLabel && ariaLabel.toLowerCase().includes('website')) ||
                      (text && text.toLowerCase().trim() === 'website')) {
                    websiteUrl = link.getAttribute('href');
                    break;
                  }
                }
              }

              // Method 3: Check for external links (not google/maps)
              if (!websiteUrl) {
                const allLinks = document.querySelectorAll('a[href^="http"]');
                for (const link of allLinks) {
                  const href = link.getAttribute('href');
                  if (href &&
                      !href.includes('google.com') &&
                      !href.includes('maps.google') &&
                      !href.includes('goo.gl') &&
                      !href.includes('accounts.google')) {
                    websiteUrl = href;
                    break;
                  }
                }
              }

              data.website = websiteUrl;

              // Extract email from the page content
              let email = null;
              const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;

              // Method 1: Check buttons and links for emails
              const allElements = document.querySelectorAll('button, a, span, div');
              for (const el of allElements) {
                const text = el.innerText || el.textContent || '';
                const href = el.getAttribute('href') || '';

                // Check for mailto links
                if (href.startsWith('mailto:')) {
                  email = href.replace('mailto:', '').split('?')[0].trim();
                  break;
                }

                // Check text content for email
                const emailMatch = text.match(emailRegex);
                if (emailMatch && emailMatch[0]) {
                  email = emailMatch[0];
                  break;
                }
              }

              // Method 2: Check entire page content
              if (!email) {
                const bodyText = document.body.innerText || document.body.textContent || '';
                const emailMatches = bodyText.match(emailRegex);
                if (emailMatches && emailMatches[0]) {
                  // Filter out common false positives
                  const validEmails = emailMatches.filter(e =>
                    !e.includes('example.com') &&
                    !e.includes('test.com') &&
                    !e.includes('sentry.') &&
                    !e.includes('noreply')
                  );
                  if (validEmails.length > 0) {
                    email = validEmails[0];
                  }
                }
              }

              data.email = email;

              return data;
            });

            // Get the current URL (Google Maps link)
            const googleMapsLink = page.url();

            // Save business data
            if (details.name) {
              // If website found but no email, try to extract email from website
              let finalEmail = details.email;
              if (details.website && !finalEmail) {
                finalEmail = await extractEmailFromWebsite(page, details.website);
              }

              const businessData = {
                businessName: details.name,
                phoneNumber: details.phone || 'N/A',
                address: details.address || 'N/A',
                rating: details.rating || 'N/A',
                reviews: details.reviews || 'N/A',
                website: details.website || 'N/A',
                email: finalEmail || 'N/A',
                googleMapsLink: googleMapsLink,
                businessType: businessType,
                location: location
              };

              results.push(businessData);
              console.log(`✓ SAVED: ${details.name}`);
              console.log(`  Phone: ${details.phone || 'N/A'}`);
              console.log(`  Website: ${details.website || 'N/A'}`);
              console.log(`  Email: ${finalEmail || 'N/A'}`);

              // Auto-save progress every 10 businesses
              if (results.length % 10 === 0) {
                console.log(`\n📊 Progress checkpoint: ${results.length}/${MAX_LEADS} leads saved`);
                saveToCsv(true); // Save without final message
              }

              // Check if we've reached the maximum
              if (results.length >= MAX_LEADS) {
                console.log(`\n🎯 Reached maximum of ${MAX_LEADS} leads!`);
                break;
              }
            } else {
              console.log('✗ Could not extract business name');
            }

            // Random delay before next business (human-like behavior)
            await randomDelay(2000, 4000);

          } catch (error) {
            console.log(`Error scraping business ${i + 1}:`, error.message);
          }
        }

        console.log(`\nCompleted ${location} - ${businessType}`);
        console.log(`Total scraped so far: ${results.length}/${MAX_LEADS}`);

        // Break if we've reached the maximum
        if (results.length >= MAX_LEADS) {
          break;
        }

      } catch (error) {
        console.error(`Error searching ${searchQuery}:`, error.message);
        console.log('Taking error screenshot for debugging...');
        try {
          await page.screenshot({ path: `error_${Date.now()}.png` });
          console.log('📸 Error screenshot saved');
        } catch (screenshotError) {
          console.log('Could not save screenshot');
        }
      }
    }

    // Break outer loop if we've reached the maximum
    if (results.length >= MAX_LEADS) {
      break;
    }
  }

  console.log('\n🏁 Scraping completed! Closing browser...');
  await randomDelay(2000, 3000);
  await browser.close();
  saveToCsv();
}

function saveToCsv(isCheckpoint = false) {
  if (results.length === 0) {
    console.log('\n⚠️  No businesses were found!');
    return;
  }

  const csvHeader = 'Business Name,Phone Number,Address,Rating,Reviews,Website,Email,Google Maps Link,Business Type,Location\n';
  const csvRows = results.map(r =>
    `"${r.businessName.replace(/"/g, '""')}","${r.phoneNumber}","${r.address.replace(/"/g, '""')}","${r.rating}","${r.reviews}","${r.website}","${r.email}","${r.googleMapsLink}","${r.businessType}","${r.location}"`
  ).join('\n');

  const csv = csvHeader + csvRows;
  const filename = `dallas_realty_businesses_${Date.now()}.csv`;

  fs.writeFileSync(filename, csv);

  // Calculate statistics
  const withWebsite = results.filter(r => r.website !== 'N/A').length;
  const withEmail = results.filter(r => r.email !== 'N/A').length;

  if (!isCheckpoint) {
    console.log(`\n========================================`);
    console.log(`✓ SUCCESS! Saved ${results.length} businesses to ${filename}`);
    console.log(`  📊 Businesses with websites: ${withWebsite}`);
    console.log(`  📧 Businesses with emails: ${withEmail}`);
    console.log(`========================================`);
  }
}

// Start scraping
console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 Enhanced Google Maps Scraper with Stealth Mode       ║
║                                                           ║
║  ✅ Puppeteer Stealth Plugin Active                      ║
║  ✅ Anti-Detection Measures Enabled                      ║
║  ✅ Progressive Scrolling (Up to ${MAX_LEADS} leads)            ║
║  ✅ Ctrl+C Graceful Shutdown (Saves data before exit)    ║
║  ✅ Auto-checkpoint every 10 businesses                  ║
║                                                           ║
║  Press Ctrl+C anytime to stop and save current progress  ║
╚═══════════════════════════════════════════════════════════╝
`);

scrapeGoogleMaps().catch(console.error);
