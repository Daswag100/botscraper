const puppeteer = require('puppeteer');
const fs = require('fs');

const locations = [
  'Shomolu, Lagos',
  'Bariga, Lagos',
  'Ikoyi, Lagos',
  'Lagos Island, Lagos',
  'Lekki, Lagos',
  'Ajah, Lagos',
  'Ikotun, Lagos',
  'Ogudu, Lagos'
];

const businessTypes = ['real estate', 'hotels'];

const results = [];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeGoogleMaps() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  for (const location of locations) {
    for (const businessType of businessTypes) {
      const searchQuery = `${businessType} in ${location}`;
      console.log(`\n========================================`);
      console.log(`Searching: ${searchQuery}`);
      console.log(`========================================`);

      try {
        await page.goto('https://www.google.com/maps', { 
          waitUntil: 'domcontentloaded',
          timeout: 60000 
        });
        await delay(3000);
        
        // Clear search box and search
        const searchBox = await page.waitForSelector('#searchboxinput', { timeout: 10000 });
        await searchBox.click({ clickCount: 3 });
        await delay(500);
        await searchBox.type(searchQuery, { delay: 100 });
        await delay(1000);
        await page.keyboard.press('Enter');
        
        console.log('Waiting for results to load...');
        await delay(8000);

        // Wait for the results panel
        try {
          await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
          console.log('Results panel loaded');
        } catch (e) {
          console.log('No results panel found, skipping...');
          continue;
        }

        // Scroll to load more results
        await autoScroll(page);
        await delay(2000);

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
        
        for (let i = 0; i < Math.min(uniqueBusinesses.length, 30); i++) {
          try {
            const businessUrl = uniqueBusinesses[i].href;
            
            // Convert relative URL to absolute if needed
            const fullUrl = businessUrl.startsWith('http') 
              ? businessUrl 
              : `https://www.google.com${businessUrl}`;
            
            console.log(`\nChecking business ${i + 1}/${uniqueBusinesses.length}...`);
            
            // Navigate directly to the business page
            await page.goto(fullUrl, { 
              waitUntil: 'domcontentloaded',
              timeout: 30000 
            });
            await delay(5000); // Wait for page to fully load

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

              // Check for website - CRITICAL CHECK
              let hasWebsite = false;
              
              // Method 1: Check for website button/link with data-item-id
              const websiteButton = document.querySelector('a[data-item-id="authority"]');
              if (websiteButton) {
                hasWebsite = true;
              }
              
              // Method 2: Look for "Website" text in buttons/links
              if (!hasWebsite) {
                const allButtons = document.querySelectorAll('button, a');
                for (const btn of allButtons) {
                  const ariaLabel = btn.getAttribute('aria-label');
                  const text = btn.innerText;
                  if ((ariaLabel && ariaLabel.toLowerCase().includes('website')) ||
                      (text && text.toLowerCase() === 'website')) {
                    hasWebsite = true;
                    break;
                  }
                }
              }
              
              // Method 3: Check for external links (not google/maps)
              if (!hasWebsite) {
                const allLinks = document.querySelectorAll('a[href^="http"]');
                for (const link of allLinks) {
                  const href = link.getAttribute('href');
                  if (href && 
                      !href.includes('google.com') && 
                      !href.includes('maps.google') &&
                      !href.includes('goo.gl') &&
                      !href.includes('accounts.google')) {
                    hasWebsite = true;
                    break;
                  }
                }
              }

              data.hasWebsite = hasWebsite;

              return data;
            });

            // Get the current URL (Google Maps link)
            const googleMapsLink = page.url();

            // Save or skip based on website status
            if (details.name) {
              if (!details.hasWebsite) {
                const businessData = {
                  businessName: details.name,
                  phoneNumber: details.phone || 'N/A',
                  address: details.address || 'N/A',
                  rating: details.rating || 'N/A',
                  reviews: details.reviews || 'N/A',
                  googleMapsLink: googleMapsLink,
                  businessType: businessType,
                  location: location
                };

                results.push(businessData);
                console.log(`✓ SAVED: ${details.name}`);
                console.log(`  Phone: ${details.phone || 'N/A'}`);
                console.log(`  (No website found)`);
              } else {
                console.log(`✗ SKIPPED: ${details.name} (Has website)`);
              }
            } else {
              console.log('✗ Could not extract business name');
            }

            // Small delay before next business
            await delay(2000);

          } catch (error) {
            console.log(`Error scraping business ${i + 1}:`, error.message);
          }
        }

        console.log(`\nCompleted ${location} - ${businessType}`);
        console.log(`Total scraped so far: ${results.length}`);

      } catch (error) {
        console.error(`Error searching ${searchQuery}:`, error.message);
      }
    }
  }

  await browser.close();
  saveToCsv();
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    const wrapper = document.querySelector('div[role="feed"]');
    if (wrapper) {
      await new Promise((resolve) => {
        let scrollCount = 0;
        const maxScrolls = 5;
        
        const timer = setInterval(() => {
          wrapper.scrollBy(0, 500);
          scrollCount++;

          if (scrollCount >= maxScrolls) {
            clearInterval(timer);
            resolve();
          }
        }, 1500);
      });
    }
  });
}

function saveToCsv() {
  if (results.length === 0) {
    console.log('\n⚠️  No businesses without websites were found!');
    return;
  }

  const csvHeader = 'Business Name,Phone Number,Address,Rating,Reviews,Google Maps Link,Business Type,Location\n';
  const csvRows = results.map(r => 
    `"${r.businessName.replace(/"/g, '""')}","${r.phoneNumber}","${r.address.replace(/"/g, '""')}","${r.rating}","${r.reviews}","${r.googleMapsLink}","${r.businessType}","${r.location}"`
  ).join('\n');

  const csv = csvHeader + csvRows;
  const filename = `lagos_businesses_${Date.now()}.csv`;

  fs.writeFileSync(filename, csv);
  console.log(`\n========================================`);
  console.log(`✓ SUCCESS! Saved ${results.length} businesses to ${filename}`);
  console.log(`========================================`);
}

scrapeGoogleMaps().catch(console.error);