const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Use stealth plugin
puppeteerExtra.use(StealthPlugin());

const locations = [
  
  'Gbadaga, Lagos',
  'Surulere, Lagos',
  'Shomolu, Lagos',
  'Yaba, Lagos',
  'Ikeja, Lagos',
  'Bariga, Lagos',
  'Ikoyi, Lagos',
  'Victoria Island, Lagos',
  'Lekki, Lagos',
  




  
];

const businessTypes = ['real estate agents'];

const results = [];
const scrapedUrls = new Set();

// Random delay with variance
async function delay(ms) {
  const variance = ms * 0.3; // 30% variance
  const randomMs = ms + (Math.random() * variance * 2 - variance);
  return new Promise(resolve => setTimeout(resolve, randomMs));
}

// Random mouse movement
async function randomMouseMovement(page) {
  const x = Math.floor(Math.random() * 1000) + 100;
  const y = Math.floor(Math.random() * 600) + 100;
  await page.mouse.move(x, y, { steps: 10 });
}

// Check for CAPTCHA
async function checkForCaptcha(page) {
  const captchaSelectors = [
    'iframe[src*="recaptcha"]',
    '#recaptcha',
    '.g-recaptcha'
  ];
  
  for (const selector of captchaSelectors) {
    const captcha = await page.$(selector);
    if (captcha) {
      console.log('⚠️ CAPTCHA DETECTED! Waiting 60 seconds...');
      await delay(60000);
      return true;
    }
  }
  return false;
}

function saveProgressToCsv() {
  if (results.length === 0) return;
  
  const csvRows = [
    ['Business Name', 'Phone Number', 'Address', 'Rating', 'Reviews Count', 'Google Maps Link', 'Business Type', 'Location']
  ];

  results.forEach(r => {
    csvRows.push([
      r.businessName,
      r.phoneNumber,
      r.address,
      r.rating,
      r.reviewsCount,
      r.googleMapsLink,
      r.businessType,
      r.location
    ]);
  });

  const csv = csvRows.map(row => {
    return row.map(cell => {
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',');
  }).join('\n');

  fs.writeFileSync('lagos_businesses_progress.csv', csv, 'utf8');
  console.log(`Auto-saved ${results.length} unique businesses`);
}

async function scrapeGoogleMaps() {
  const browser = await puppeteerExtra.launch({
    headless: false,
    protocolTimeout: 180000, // 3 minutes
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  page.setDefaultNavigationTimeout(180000);
  
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  for (const location of locations) {
    for (const businessType of businessTypes) {
      const searchQuery = `${businessType} in ${location}`;
      console.log(`\n========================================`);
      console.log(`Searching: ${searchQuery}`);
      console.log(`========================================`);

      let retries = 0;
      const maxRetries = 3;
      let success = false;

      while (retries < maxRetries && !success) {
        try {
          console.log(`Attempt ${retries + 1}/${maxRetries}`);
          
          // Random mouse movement (act human)
          await randomMouseMovement(page);
          await delay(3000);
          
          await page.goto('https://www.google.com/maps', { 
            waitUntil: 'networkidle2',
            timeout: 120000 
          });
          
          // Check for CAPTCHA
          await checkForCaptcha(page);
          
          await delay(5000);
          
          const searchBox = await page.waitForSelector('#searchboxinput', { timeout: 30000 });
          await searchBox.click({ clickCount: 3 });
          await delay(1000);
          
          // Type with random speed (human-like)
          await searchBox.type(searchQuery, { delay: 100 + Math.random() * 100 });
          await delay(2000);
          await page.keyboard.press('Enter');
          
          console.log('Waiting for results to load...');
          await delay(12000); // Longer wait

          try {
            await page.waitForSelector('div[role="feed"]', { timeout: 20000 });
            console.log('Results panel loaded ✓');
            success = true;
          } catch (e) {
            console.log('No results panel found');
            retries++;
            
            if (retries < maxRetries) {
              console.log(`Retrying in 15 seconds...`);
              await delay(15000);
            } else {
              console.log('Max retries reached, skipping...');
              break;
            }
            continue;
          }

          if (!success) continue;

          await autoScroll(page);
          await delay(3000);

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
            break;
          }

          const uniqueBusinesses = [...new Map(businesses.map(b => [b.href, b])).values()];
          
          for (let i = 0; i < Math.min(uniqueBusinesses.length, 50); i++) {
            try {
              const businessUrl = uniqueBusinesses[i].href;
              const fullUrl = businessUrl.startsWith('http') ? businessUrl : `https://www.google.com${businessUrl}`;
              
              const placeIdMatch = fullUrl.match(/place\/([^\/]+)/);
              const placeId = placeIdMatch ? placeIdMatch[1] : fullUrl;
              
              if (scrapedUrls.has(placeId)) {
                console.log(`\nBusiness ${i + 1}/${uniqueBusinesses.length}: Already scraped, skipping...`);
                continue;
              }
              
              console.log(`\nChecking business ${i + 1}/${uniqueBusinesses.length}...`);
              
              // Random mouse movement before clicking
              await randomMouseMovement(page);
              await delay(2000);
              
              await page.goto(fullUrl, { 
                waitUntil: 'networkidle2',
                timeout: 60000 
              });
              await delay(6000); // Longer wait

              const details = await page.evaluate(() => {
                const data = {};

                let name = null;
                const nameSelectors = ['h1.DUwDvf', 'h1.fontHeadlineLarge', 'h1[class*="fontHeadline"]', 'div[class*="fontHeadline"]'];
                
                for (const selector of nameSelectors) {
                  const nameEl = document.querySelector(selector);
                  if (nameEl && nameEl.innerText) {
                    name = nameEl.innerText.trim();
                    break;
                  }
                }
                data.name = name;

                let phone = null;
                const phoneButtons = document.querySelectorAll('button[data-item-id^="phone"]');
                if (phoneButtons.length > 0) {
                  const ariaLabel = phoneButtons[0].getAttribute('aria-label');
                  if (ariaLabel) {
                    phone = ariaLabel.replace('Phone:', '').replace('Copy phone number', '').trim();
                  }
                }
                
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

                const addressButton = document.querySelector('button[data-item-id="address"]');
                if (addressButton) {
                  const ariaLabel = addressButton.getAttribute('aria-label');
                  data.address = ariaLabel ? ariaLabel.replace('Address: ', '').trim() : null;
                } else {
                  data.address = null;
                }

                let rating = null;
                let reviewsCount = null;
                
                const ratingDiv = document.querySelector('div.F7nice');
                if (ratingDiv) {
                  const ratingSpan = ratingDiv.querySelector('span[aria-hidden="true"]');
                  if (ratingSpan) {
                    rating = ratingSpan.innerText.trim();
                  }
                  
                  const reviewSpan = ratingDiv.querySelector('span[aria-label]');
                  if (reviewSpan) {
                    const ariaText = reviewSpan.getAttribute('aria-label');
                    const match = ariaText.match(/([\d,]+)\s*review/i);
                    if (match) {
                      reviewsCount = match[1].replace(/,/g, '');
                    }
                  }
                }
                
                if (!reviewsCount) {
                  const allText = document.body.innerText;
                  const match = allText.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*reviews?/i);
                  if (match) {
                    reviewsCount = match[1].replace(/,/g, '');
                  }
                }
                
                data.rating = rating;
                data.reviewsCount = reviewsCount;

                let hasWebsite = false;
                
                const websiteButton = document.querySelector('a[data-item-id="authority"]');
                if (websiteButton) {
                  hasWebsite = true;
                }
                
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

              let googleMapsLink = page.url();
              
              try {
                const urlObj = new URL(googleMapsLink);
                googleMapsLink = urlObj.origin + urlObj.pathname;
              } catch (e) {
                // Keep original
              }

              if (details.name) {
                if (!details.hasWebsite) {
                  scrapedUrls.add(placeId);
                  
                  const businessData = {
                    businessName: details.name,
                    phoneNumber: details.phone || 'N/A',
                    address: details.address || 'N/A',
                    rating: details.rating || 'N/A',
                    reviewsCount: details.reviewsCount || 'N/A',
                    googleMapsLink: googleMapsLink,
                    businessType: businessType,
                    location: location
                  };

                  results.push(businessData);
                  console.log(`✓ SAVED: ${details.name}`);
                  console.log(`  Phone: ${details.phone || 'N/A'}`);
                  console.log(`  (No website found)`);
                } else {
                  scrapedUrls.add(placeId);
                  console.log(`✗ SKIPPED: ${details.name} (Has website)`);
                }
              } else {
                console.log('✗ Could not extract business name');
              }

              await delay(3000); // Longer delay between businesses

            } catch (error) {
              console.log(`Error scraping business ${i + 1}:`, error.message);
            }
          }

          console.log(`\nCompleted ${location} - ${businessType}`);
          console.log(`Total unique businesses scraped: ${results.length}`);
          console.log(`Total businesses checked: ${scrapedUrls.size}`);
          
          saveProgressToCsv();

        } catch (error) {
          console.error(`Error on attempt ${retries + 1}:`, error.message);
          retries++;
          
          if (retries < maxRetries) {
            console.log(`Waiting 20 seconds before retry...`);
            await delay(20000);
          }
        }
      }
      
      // Longer break between searches
      console.log('Taking a 15-second break before next search...');
      await delay(15000);
    }
  }

  await browser.close().catch(err => {
    console.log('Browser closed');
  });
  
  saveFinalCsv();
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
        }, 2000); // Slower scrolling
      });
    }
  });
}

function saveFinalCsv() {
  if (results.length === 0) {
    console.log('\nNo businesses without websites were found!');
    return;
  }

  const csvRows = [
    ['Business Name', 'Phone Number', 'Address', 'Rating', 'Reviews Count', 'Google Maps Link', 'Business Type', 'Location']
  ];

  results.forEach(r => {
    csvRows.push([
      r.businessName,
      r.phoneNumber,
      r.address,
      r.rating,
      r.reviewsCount,
      r.googleMapsLink,
      r.businessType,
      r.location
    ]);
  });

  const csv = csvRows.map(row => {
    return row.map(cell => {
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',');
  }).join('\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `lagos_businesses_${timestamp}.csv`;
  const filepath = `./${filename}`;

  fs.writeFileSync(filepath, csv, 'utf8');
  
  console.log(`\n========================================`);
  console.log(`SUCCESS! Saved ${results.length} unique businesses`);
  console.log(`\nFile saved: ${filename}`);
  console.log(`Full path: ${path.resolve(filepath)}`);
  console.log(`\nClick to open: file:///${path.resolve(filepath).replace(/\\/g, '/')}`);
  console.log(`========================================\n`);
}

scrapeGoogleMaps().catch(console.error);