const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Configure your search parameters
const locations = [
  
  
  'Texas, Usa',
  'alabama, Usa',
  'chicago, Usa',
  'virginia, Usa'
  
  ,
  
  // Add more locations as needed
];

const businessTypes = ['Restaurant'];

const results = [];
let isGracefulShutdown = false;
let totalScanned = 0;
let businessesWithEmails = 0;
let businessesWithoutEmails = 0;
let businessesFilteredByRating = 0;

// Maximum number of leads to scrape (increased to 500)
const MAX_LEADS = 500;

// Rating filter: only scrape businesses with ratings between 2.0 and 4.3
const MIN_RATING = 2.0;
const MAX_RATING = 4.3;

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
  const contactPaths = ['',];
  const maxRetries = 1;

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

        return { website, phone, address };
      });

      return details;
    } catch (error) {
      console.log(`   ⚠️  Error clicking business for details: ${error.message}`);
      return { website: null, phone: null, address: null };
    }
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: false, // Keep false to monitor progress
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920x1080'
      ]
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
    
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }

  async searchServiceInArea(serviceType, city, state = '') {
    const searchQuery = state ? 
      `${serviceType} near ${city}, ${state}` : 
      `${serviceType} near ${city}`;
    
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://www.google.com/maps/search/${encodedQuery}`;
    
    console.log(`🔍 Searching: ${searchQuery}`);
    console.log(`🌐 URL: ${url}`);
    
    try {
      await this.page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      
      console.log('✅ Page loaded, waiting for content...');
      await this.waitFor(8000);
      
      console.log('🔍 Analyzing page structure...');
      
    } catch (error) {
      throw new Error(`Failed to load Google Maps: ${error.message}`);
    }
  }

  async analyzePageStructure() {
    console.log('🔍 Analyzing what elements are available on the page...');
    
    const analysis = await this.page.evaluate(() => {
      const possibleSelectors = [
        '[role="article"]',
        'div[data-result-index]',
        '[jsaction*="mouseover"]',
        'div[class*="result"]',
        'a[data-cid]',
        'div[data-cid]',
        '[aria-label*="results"]',
        'div[class*="Nv2PK"]',
        'div[jsaction]',
        'div[data-value]'
      ];
      
      const results = {};
      
      possibleSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results[selector] = {
            count: elements.length,
            sampleText: elements[0].textContent?.substring(0, 100) || 'No text'
          };
        }
      });
      
      const allDivs = document.querySelectorAll('div');
      let businessLikeDivs = 0;
      
      Array.from(allDivs).forEach(div => {
        const text = div.textContent || '';
        if (text.match(/plumbing|service|repair|company|llc|inc|corp|solutions|pro|expert/i) && 
            text.length > 5 && text.length < 100) {
          businessLikeDivs++;
        }
      });
      
      results['business-like-divs'] = { count: businessLikeDivs };
      
      return results;
    });
    
    console.log('📊 Page analysis results:');
    Object.entries(analysis).forEach(([selector, info]) => {
      console.log(`   ${selector}: ${info.count} elements`);
      if (info.sampleText) {
        console.log(`      Sample: "${info.sampleText}"`);
      }
    });
    
    return analysis;
  }

  // Scroll the results panel to load more businesses
  async scrollResultsPanel() {
    try {
      const scrolled = await this.page.evaluate(() => {
        // Find the scrollable results panel
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
            } else if (businessInfo.rating > 3.9) {
              highRatedCount++;
              console.log(`❌ TOO HIGH RATING: ${businessInfo.name} (${businessInfo.rating}⭐) - Rating too good for outreach`);
            } else if (businessInfo.rating < 2) {
              lowRatedCount++;
              console.log(`❌ TOO LOW RATING: ${businessInfo.name} (${businessInfo.rating}⭐) - Might be out of business`);
            }
          } else {
            console.log(`❌ NO RATING: ${businessInfo.name} - Can't determine star rating`);
          }
        }
      } catch (error) {
        console.log(`❌ Error processing business: ${error.message}`);
      }
    }
    
    console.log(`\n📊 SEARCH COMPLETE!`);
    console.log(`📋 Total businesses scanned: ${totalScanned}`);
    console.log(`✅ Perfect leads (2-3.9⭐): ${perfectRatingCount}`);
    console.log(`❌ Too high rated (4.0+⭐): ${highRatedCount}`);
    console.log(`❌ Too low rated (<2⭐): ${lowRatedCount}`);
    console.log(`🎯 Final qualifying leads: ${businesses.length}`);
    
    return businesses;
  }

  // NEW ENHANCED METHOD FOR 1-4.1 STAR RANGE WITH EMAIL EXTRACTION
  async getBusinessesInAreaExpanded(serviceType, city, state = '', options = {}) {
    const {
      minReviews = 3,
      maxBusinesses = 15,
      minStars = 1.0,
      maxStars = 4.1,
      extractEmails = true, // NEW: Enable email extraction by default
      maxScrolls = 10 // Maximum number of scroll attempts
    } = options;

    await this.searchServiceInArea(serviceType, city, state);

    console.log('📋 Extracting business listings...');
    console.log(`🎯 Looking for businesses with ${minStars}-${maxStars} star ratings...`);
    console.log(`🔍 Minimum reviews required: ${minReviews}`);
    if (extractEmails) {
      console.log(`📧 Email extraction: ENABLED`);
    }
    console.log(`📜 Will scroll up to ${maxScrolls} times to find results\n`);

    const businesses = [];
    const processedNames = new Set(); // Track processed businesses to avoid duplicates
    let totalScanned = 0;
    let tooHighCount = 0;
    let tooLowCount = 0;
    let perfectCount = 0;
    let emailsFound = 0;
    let scrollAttempts = 0;
    let consecutiveNoNewResults = 0;

    // Progressive scrolling and scanning
    while (scrollAttempts < maxScrolls && businesses.length < maxBusinesses) {
      scrollAttempts++;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📜 Scroll attempt ${scrollAttempts}/${maxScrolls}`);
      console.log(`${'='.repeat(80)}`);

      // Get current business elements
      const businessElements = await this.findBusinessElements();

      if (businessElements.length === 0) {
        console.log('⚠️  No business elements found on the page.');
        break;
      }

      console.log(`📍 Currently visible: ${businessElements.length} business elements`);

      let newResultsFound = false;

      // Process each visible business element
      for (let i = 0; i < businessElements.length && businesses.length < maxBusinesses; i++) {
        const element = businessElements[i];

        try {
          const businessInfo = await this.extractBusinessInfoEnhanced(element);

          if (businessInfo && businessInfo.name) {
            // Skip if already processed
            if (processedNames.has(businessInfo.name)) {
              continue;
            }

            processedNames.add(businessInfo.name);
            totalScanned++;
            newResultsFound = true;

            const ratingText = businessInfo.rating ? `${businessInfo.rating}⭐` : 'No rating';
            const reviewText = businessInfo.reviewCount ? `(${businessInfo.reviewCount} reviews)` : '(No reviews)';

            console.log(`\n📊 Business #${totalScanned}: ${businessInfo.name}`);
            console.log(`   Rating: ${ratingText} ${reviewText}`);

            if (businessInfo.rating) {
              if (businessInfo.rating >= minStars && businessInfo.rating <= maxStars) {
                if (businessInfo.reviewCount >= minReviews) {
                  // NEW: Click on business to get detailed info including website
                  console.log(`   🖱️  Clicking business to get details...`);
                  const details = await this.clickBusinessForDetails(element);

                  // Merge the details with business info
                  businessInfo.website = details.website || businessInfo.website || '';
                  businessInfo.phone = details.phone || businessInfo.phone || '';
                  businessInfo.address = details.address || businessInfo.address || '';

                  console.log(`   🌐 Website: ${businessInfo.website || 'Not found'}`);
                  console.log(`   📞 Phone: ${businessInfo.phone || 'Not found'}`);
                  console.log(`   📍 Address: ${businessInfo.address || 'Not found'}`);

                  // NEW: Extract email if website exists and email extraction is enabled
                  let email = null;
                  if (extractEmails && businessInfo.website) {
                    console.log(`\n   📧 Starting email extraction for ${businessInfo.name}...`);
                    email = await this.extractEmailFromWebsite(businessInfo.website, businessInfo.name);
                    if (email) {
                      emailsFound++;
                      console.log(`   ✅ EMAIL FOUND: ${email}`);
                    } else {
                      console.log(`   ❌ No email found`);
                    }
                  } else if (!businessInfo.website) {
                    console.log(`   ⚠️  No website to extract email from`);
                  }

                  // ONLY save businesses WITH emails when extractEmails is enabled
                  if (!extractEmails || email) {
                    businesses.push({
                      ...businessInfo,
                      email: email || '', // Add email field
                      serviceType: serviceType,
                      searchLocation: `${city}${state ? ', ' + state : ''}`,
                      extractedAt: new Date().toISOString()
                    });

                    perfectCount++;
                    const urgency = businessInfo.rating < 2.0 ? 'CRITICAL' :
                                   businessInfo.rating < 3.0 ? 'URGENT' : 'HIGH';

                    console.log(`\n✅ ${urgency} LEAD #${perfectCount}: ${businessInfo.name} (${businessInfo.rating}⭐, ${businessInfo.reviewCount} reviews)`);
                    console.log(`   Email: ${email || 'Not extracted'}`);
                    console.log(`   Status: SAVED TO RESULTS`);
                  } else {
                    console.log(`\n✗ SKIPPED: ${businessInfo.name} - No email found (email extraction enabled)`);
                  }

                  // Close the details panel to go back to the list
                  try {
                    await this.page.keyboard.press('Escape');
                    await this.waitFor(1000);
                  } catch (e) {
                    // Ignore errors when closing details panel
                  }
                } else {
                  console.log(`❌ NOT ENOUGH REVIEWS: ${businessInfo.name} (${businessInfo.rating}⭐) - Only ${businessInfo.reviewCount} reviews (need ${minReviews}+)`);
                }
              } else if (businessInfo.rating > maxStars) {
                tooHighCount++;
                console.log(`❌ TOO HIGH RATING: ${businessInfo.name} (${businessInfo.rating}⭐) - Already doing well`);
              } else if (businessInfo.rating < minStars) {
                tooLowCount++;
                console.log(`❌ TOO LOW RATING: ${businessInfo.name} (${businessInfo.rating}⭐) - Might be permanently closed`);
              }
            } else {
              console.log(`❌ NO RATING: ${businessInfo.name} - Can't determine star rating`);
            }
          }
        } catch (error) {
          console.log(`❌ Error processing business: ${error.message}`);
        }
      }

      // Check if we found new results
      if (!newResultsFound) {
        consecutiveNoNewResults++;
        console.log(`\n⚠️  No new results found in this scroll (${consecutiveNoNewResults}/3)`);

        if (consecutiveNoNewResults >= 3) {
          console.log(`\n🛑 Stopping: No new results after 3 consecutive scrolls`);
          break;
        }
      } else {
        consecutiveNoNewResults = 0; // Reset counter
      }

      // Stop if we have enough qualifying leads
      if (businesses.length >= maxBusinesses) {
        console.log(`\n✅ Found ${businesses.length} qualifying leads - target reached!`);
        break;
      }

      // Scroll down to load more results
      if (scrollAttempts < maxScrolls) {
        console.log(`\n📜 Scrolling to load more results...`);
        const scrolled = await this.scrollResultsPanel();

        if (!scrolled) {
          console.log(`\n⚠️  Could not scroll further - might be at the end of results`);
          consecutiveNoNewResults++;

          if (consecutiveNoNewResults >= 2) {
            break;
          }
        }

        // Wait for new content to load
        await this.waitFor(3000);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`\n📊 SEARCH COMPLETE!`);
    console.log(`📋 Total businesses scanned: ${totalScanned}`);
    console.log(`✅ Opportunity leads (${minStars}-${maxStars}⭐): ${perfectCount}`);
    console.log(`📧 Emails found: ${emailsFound} out of ${perfectCount}`);
    console.log(`❌ Too high rated (${maxStars}+⭐): ${tooHighCount}`);
    console.log(`❌ Too low rated (<${minStars}⭐): ${tooLowCount}`);
    console.log(`🎯 Final qualifying leads: ${businesses.length}`);

    return businesses;
  }

  // NEW ENHANCED EXTRACTION WITH GOOGLE MAPS URLS
  async extractBusinessInfoEnhanced(businessElement) {
    return await this.page.evaluate((element) => {
      try {
        const getText = (selectors) => {
          for (const selector of selectors) {
            const el = element.querySelector(selector);
            if (el && el.textContent?.trim()) {
              return el.textContent.trim();
            }
          }
          return null;
        };
        
        const nameSelectors = [
          '[class*="fontHeadlineSmall"]',
          'h3',
          '[role="button"] div[class*="fontBodyMedium"]',
          'a[data-cid]',
          'div[data-cid]'
        ];
        
        let businessName = getText(nameSelectors);
        
        if (!businessName) {
          const allText = element.textContent || '';
          const lines = allText.split('\n').filter(line => line.trim().length > 0);
          
          for (const line of lines) {
            if (line.length > 5 && line.length < 80 && 
                !line.match(/\d+\.?\d*\s*star/i) &&
                !line.match(/^\d+\s*(reviews?|mins?|hours?|days?)/i)) {
              businessName = line.trim();
              break;
            }
          }
        }
        
        if (!businessName || businessName === 'Unknown Business') {
          return null;
        }
        
        let rating = null;
        const ratingSelectors = [
          '[role="img"][aria-label*="star"]',
          '[aria-label*="star"]',
          'span[aria-label*="star"]'
        ];
        
        for (const selector of ratingSelectors) {
          const ratingElement = element.querySelector(selector);
          if (ratingElement) {
            const ariaLabel = ratingElement.getAttribute('aria-label');
            const ratingMatch = ariaLabel.match(/(\d+\.?\d*)\s*star/i);
            if (ratingMatch) {
              rating = parseFloat(ratingMatch[1]);
              break;
            }
          }
        }
        
        if (!rating) {
          const allText = element.textContent || '';
          const ratingMatch = allText.match(/(\d+\.?\d*)\s*star/i);
          if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
          }
        }
        
        let reviewCount = 0;
        const reviewText = element.textContent || '';
        const reviewMatches = [
          reviewText.match(/\((\d+(?:,\d+)*)\s*review/i),
          reviewText.match(/(\d+(?:,\d+)*)\s*review/i),
          reviewText.match(/\((\d+(?:,\d+)*)\)/i)
        ];
        
        for (const match of reviewMatches) {
          if (match) {
            reviewCount = parseInt(match[1].replace(/,/g, ''));
            break;
          }
        }
        
        // Extract Google Maps URL
        let googleMapsUrl = '';
        const linkElement = element.querySelector('a[data-cid], a[href*="/maps/"]');
        if (linkElement) {
          const href = linkElement.getAttribute('href');
          const dataCid = linkElement.getAttribute('data-cid');
          
          if (href && href.includes('maps')) {
            googleMapsUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
          } else if (dataCid) {
            googleMapsUrl = `https://www.google.com/maps/place/?cid=${dataCid}`;
          }
        }
        
        if (!googleMapsUrl && businessName) {
          const encodedName = encodeURIComponent(businessName);
          googleMapsUrl = `https://www.google.com/maps/search/${encodedName}`;
        }

        return {
          name: businessName,
          rating: rating,
          reviewCount: reviewCount,
          address: '',
          phone: '',
          website: '',
          googleMapsUrl: googleMapsUrl
        };
      } catch (error) {
        console.log('Error extracting business info:', error);
        return null;
      }
    }, businessElement);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  // NEW: Export businesses to CSV with email column
  exportToCSV(businesses, filename = 'businesses_with_emails.csv') {
    if (!businesses || businesses.length === 0) {
      console.log('⚠️  No businesses to export');
      return;
    }

    // CSV Headers
    const headers = [
      'Business Name',
      'Rating',
      'Review Count',
      'Address',
      'Phone',
      'Website',
      'Email',
      'Service Type',
      'Search Location',
      'Google Maps URL',
      'Extracted At'
    ];

    // Convert businesses to CSV rows
    const rows = businesses.map(business => {
      return [
        `"${(business.name || '').replace(/"/g, '""')}"`,
        business.rating || '',
        business.reviewCount || '',
        `"${(business.address || '').replace(/"/g, '""')}"`,
        business.phone || '',
        business.website || '',
        business.email || '',
        business.serviceType || '',
        business.searchLocation || '',
        business.googleMapsUrl || '',
        business.extractedAt || ''
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Save to file
    try {
      if (!fs.existsSync('./results')) {
        fs.mkdirSync('./results', { recursive: true });
      }

      const filepath = `./results/${filename}`;
      fs.writeFileSync(filepath, csvContent);
      console.log(`\n📁 CSV file saved: ${filepath}`);
      console.log(`📊 Total records: ${businesses.length}`);
      console.log(`📧 Records with emails: ${businesses.filter(b => b.email).length}`);
    } catch (error) {
      console.error(`❌ Error saving CSV: ${error.message}`);
    }
  }

  // NEW: Export businesses to JSON
  exportToJSON(businesses, filename = 'businesses_with_emails.json') {
    if (!businesses || businesses.length === 0) {
      console.log('⚠️  No businesses to export');
      return;
    }

    try {
      if (!fs.existsSync('./results')) {
        fs.mkdirSync('./results', { recursive: true });
      }

      const filepath = `./results/${filename}`;
      fs.writeFileSync(filepath, JSON.stringify(businesses, null, 2));
      console.log(`\n📁 JSON file saved: ${filepath}`);
      console.log(`📊 Total records: ${businesses.length}`);
      console.log(`📧 Records with emails: ${businesses.filter(b => b.email).length}`);
    } catch (error) {
      console.error(`❌ Error saving JSON: ${error.message}`);
    }
  }
}

// Usage functions
async function generateServiceLeads() {
  const scraper = new ServiceBusinessLeadScraper();

  const serviceTypes = [
    'roofing contractors',
    'solar installation companies', 
    'plumbers',
    'chiropractors',
    'construction companies',
    'electricians',
    'dentists'
  ];

  const locations = [
    { city: 'Los Angeles', state: 'California' },
    { city: 'Miami', state: 'Florida' },
    { city: 'Houston', state: 'Texas' },
    { city: 'Phoenix', state: 'Arizona' },
    { city: 'Atlanta', state: 'Georgia' }
  ];

  try {
    const results = await scraper.scrapeServiceLeads(serviceTypes, locations, {
      minReviews: 5,
      maxBusinessesPerSearch: 25,
      outputDir: './service_leads'
    });

    console.log('\n📈 LEAD GENERATION SUMMARY:');
    console.log(`📋 Total Leads: ${results.totalLeads}`);
    console.log(`⭐ Average Rating: ${results.summary.averageRating} stars`);
    
    console.log('\n📊 By Service Type:');
    Object.entries(results.summary.byServiceType).forEach(([service, count]) => {
      console.log(`   ${service}: ${count} businesses`);
    });

    console.log('\n🎯 These businesses need your help improving their reputation!');

  } catch (error) {
    console.error('❌ Lead generation failed:', error);
  }
}

async function testSingleService() {
  const scraper = new ServiceBusinessLeadScraper();

  try {
    await scraper.init();

    // NEW: Using enhanced method with email extraction and scrolling
    const businesses = await scraper.getBusinessesInAreaExpanded(
      'plumbers',
      'Phoenix',
      'Arizona',
      {
        minReviews: 2,
        maxBusinesses: 10, // Increased to allow finding more leads
        minStars: 2.0, // Focus on 2.0-3.9 star range
        maxStars: 3.9,
        extractEmails: false, // Disable email extraction for faster testing
        maxScrolls: 15 // Increased scroll attempts to find lower-rated businesses
      }
    );

    console.log(`\n🎉 FINAL RESULTS: Found ${businesses.length} businesses with 2.0-3.9 star ratings:`);

    if (businesses.length > 0) {
      businesses.forEach((business, i) => {
        console.log(`\n${i+1}. ${business.name}`);
        console.log(`   ⭐ Rating: ${business.rating} (${business.reviewCount} reviews)`);
        console.log(`   📍 Address: ${business.address || 'Not found'}`);
        console.log(`   📞 Phone: ${business.phone || 'Not found'}`);
        console.log(`   🌐 Website: ${business.website || 'Not found'}`);
        console.log(`   📧 Email: ${business.email || 'Not found'}`);
        console.log(`   💡 Outreach opportunity: Low rating needs reputation help!`);
      });

      // NEW: Export to CSV with email column
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const csvFilename = `plumbers_phoenix_${timestamp}.csv`;
      const jsonFilename = `plumbers_phoenix_${timestamp}.json`;

      scraper.exportToCSV(businesses, csvFilename);
      scraper.exportToJSON(businesses, jsonFilename);

      console.log(`\n✅ Results exported successfully!`);

    } else {
      console.log('\n📝 No businesses found with 2-3.9 star ratings.');
      console.log('💡 Try a different city or service type, or lower the minReviews requirement.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    console.log('\n🔄 Closing browser...');
    await scraper.close();
  }
}

module.exports = ServiceBusinessLeadScraper;

if (require.main === module) {
  testSingleService();
}