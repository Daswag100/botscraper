const puppeteer = require('puppeteer');
const fs = require('fs');

class ServiceBusinessLeadScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.emailPage = null; // Separate page for email extraction
  }

  // Helper function to wait - works with all Puppeteer versions
  async waitFor(ms) {
    await this.page.evaluate((ms) => {
      return new Promise(resolve => setTimeout(resolve, ms));
    }, ms);
  }

  // Extract emails from page content using multiple methods
  async extractEmailsFromPage(page) {
    try {
      const emails = await page.evaluate(() => {
        const emailSet = new Set();
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

        // Method 1: Extract from mailto: links
        const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
        mailtoLinks.forEach(link => {
          const href = link.getAttribute('href');
          const email = href.replace('mailto:', '').split('?')[0].trim();
          if (email && emailRegex.test(email)) {
            emailSet.add(email.toLowerCase());
          }
        });

        // Method 2: Extract from all text content
        const bodyText = document.body.innerText || '';
        const textEmails = bodyText.match(emailRegex);
        if (textEmails) {
          textEmails.forEach(email => emailSet.add(email.toLowerCase()));
        }

        // Method 3: Extract from HTML content
        const htmlContent = document.body.innerHTML || '';
        const htmlEmails = htmlContent.match(emailRegex);
        if (htmlEmails) {
          htmlEmails.forEach(email => emailSet.add(email.toLowerCase()));
        }

        // Method 4: Check specific sections (footer, header, contact sections)
        const sections = document.querySelectorAll('footer, header, [class*="contact"], [id*="contact"], [class*="footer"], [id*="footer"]');
        sections.forEach(section => {
          const sectionText = section.innerText || '';
          const sectionEmails = sectionText.match(emailRegex);
          if (sectionEmails) {
            sectionEmails.forEach(email => emailSet.add(email.toLowerCase()));
          }
        });

        return Array.from(emailSet);
      });

      // Filter out common false positives
      const validEmails = emails.filter(email => {
        const lowerEmail = email.toLowerCase();
        return !lowerEmail.includes('example.com') &&
               !lowerEmail.includes('test.com') &&
               !lowerEmail.includes('yourdomain.com') &&
               !lowerEmail.includes('yourcompany.com') &&
               !lowerEmail.includes('.png') &&
               !lowerEmail.includes('.jpg') &&
               !lowerEmail.includes('.jpeg') &&
               !lowerEmail.includes('.gif') &&
               !lowerEmail.includes('.svg');
      });

      return validEmails;
    } catch (error) {
      console.log(`   ⚠️  Error extracting emails from page: ${error.message}`);
      return [];
    }
  }

  // Try to find contact pages and extract emails
  async tryContactPages(page, baseUrl) {
    const contactPaths = [
      '/contact',
      '/contact-us',
      '/contactus',
      '/about',
      '/about-us',
      '/aboutus',
      '/contact.html',
      '/contact-us.html',
      '/about.html',
      '/about-us.html'
    ];

    const allEmails = new Set();

    for (const path of contactPaths) {
      try {
        const contactUrl = new URL(path, baseUrl).href;
        console.log(`   🔍 Trying contact page: ${contactUrl}`);

        await page.goto(contactUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });

        await page.waitForTimeout(2000);

        const emails = await this.extractEmailsFromPage(page);
        if (emails.length > 0) {
          console.log(`   ✅ Found ${emails.length} email(s) on ${path}: ${emails.join(', ')}`);
          emails.forEach(email => allEmails.add(email));
          break; // Stop after finding emails
        }
      } catch (error) {
        // Silently continue to next path
        continue;
      }
    }

    return Array.from(allEmails);
  }

  // Main email extraction function with retry logic
  async extractEmailFromWebsite(websiteUrl, businessName, maxRetries = 2) {
    if (!websiteUrl) {
      console.log(`   ⚠️  No website URL provided for ${businessName}`);
      return null;
    }

    console.log(`   🌐 Visiting website: ${websiteUrl}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let tempPage = null;
      try {
        // Create a new page for email extraction
        tempPage = await this.browser.newPage();
        await tempPage.setViewport({ width: 1920, height: 1080 });
        await tempPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Set a reasonable timeout
        tempPage.setDefaultTimeout(20000);

        // Visit the main website page
        console.log(`   📡 Attempt ${attempt}/${maxRetries}: Loading website...`);
        await tempPage.goto(websiteUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        });

        await tempPage.waitForTimeout(3000);

        // Extract emails from main page
        let emails = await this.extractEmailsFromPage(tempPage);

        if (emails.length > 0) {
          console.log(`   ✅ Found ${emails.length} email(s) on main page: ${emails.join(', ')}`);
          await tempPage.close();
          return emails[0]; // Return first email found
        }

        // Try contact pages if no emails found on main page
        console.log(`   🔍 No emails on main page, checking contact pages...`);
        emails = await this.tryContactPages(tempPage, websiteUrl);

        if (emails.length > 0) {
          await tempPage.close();
          return emails[0]; // Return first email found
        }

        console.log(`   ❌ No emails found on ${websiteUrl}`);
        await tempPage.close();
        return null;

      } catch (error) {
        console.log(`   ⚠️  Attempt ${attempt} failed: ${error.message}`);
        if (tempPage) {
          try {
            await tempPage.close();
          } catch (e) {
            // Ignore close errors
          }
        }

        if (attempt < maxRetries) {
          console.log(`   🔄 Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    console.log(`   ❌ Failed to extract email after ${maxRetries} attempts`);
    return null;
  }

  // Click on business and extract detailed info including website
  async clickBusinessForDetails(businessElement) {
    try {
      // Try to click on the business element
      await businessElement.click();
      console.log('   📍 Clicked on business, waiting for details panel...');
      await this.waitFor(3000);

      // Extract website and other details from the details panel
      const details = await this.page.evaluate(() => {
        const getTextContent = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : null;
        };

        const getAttribute = (selector, attribute) => {
          const element = document.querySelector(selector);
          return element ? element.getAttribute(attribute) : null;
        };

        // Try to find website link
        let website = null;
        const websiteSelectors = [
          'a[data-item-id="authority"]',
          'a[href*="http"][data-item-id*="web"]',
          'a[aria-label*="Website"]',
          'button[data-item-id="authority"]',
          '[data-tooltip*="website" i] a',
          'a[href*="http"]:not([href*="google"])',
        ];

        for (const selector of websiteSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            let href = element.getAttribute('href');
            if (!href) {
              // Try to find href in parent or children
              const linkInside = element.querySelector('a[href]');
              if (linkInside) {
                href = linkInside.getAttribute('href');
              }
            }
            if (href && href.startsWith('http') && !href.includes('google.com')) {
              website = href;
              break;
            }
          }
        }

        // Try to find phone number
        let phone = null;
        const phoneSelectors = [
          'button[data-item-id*="phone"]',
          'button[aria-label*="Phone"]',
          '[data-tooltip*="phone" i]'
        ];

        for (const selector of phoneSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const phoneText = element.textContent || element.getAttribute('aria-label') || '';
            const phoneMatch = phoneText.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
            if (phoneMatch) {
              phone = phoneMatch[0];
              break;
            }
          }
        }

        // Try to find address
        let address = null;
        const addressSelectors = [
          'button[data-item-id*="address"]',
          'button[aria-label*="Address"]',
          '[data-tooltip*="address" i]'
        ];

        for (const selector of addressSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            address = element.textContent.trim();
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

  // Extract reviews from the business details panel
  async extractReviewsFromBusiness(maxReviews = 10) {
    try {
      console.log(`   📝 Extracting reviews...`);

      // Try to find and click the reviews tab/section
      const reviewsTabClicked = await this.page.evaluate(() => {
        const reviewsTabSelectors = [
          'button[aria-label*="Reviews"]',
          'button[data-tab-index="1"]',
          '[role="tab"][aria-label*="Reviews"]',
          'button:has-text("Reviews")',
        ];

        for (const selector of reviewsTabSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              element.click();
              return true;
            }
          } catch (e) {
            continue;
          }
        }
        return false;
      });

      if (reviewsTabClicked) {
        console.log(`   ✅ Clicked on reviews tab`);
        await this.waitFor(2000);
      }

      // Scroll through reviews to load more
      let scrollAttempts = 0;
      const maxScrollAttempts = 3;

      while (scrollAttempts < maxScrollAttempts) {
        const scrolled = await this.page.evaluate(() => {
          const reviewsContainer = document.querySelector('[role="main"]');
          if (reviewsContainer) {
            const scrollableElements = reviewsContainer.querySelectorAll('div[class*="scroll"]');
            for (const el of scrollableElements) {
              if (el.scrollHeight > el.clientHeight) {
                const beforeScroll = el.scrollTop;
                el.scrollTop += 500;
                return el.scrollTop > beforeScroll;
              }
            }
          }
          return false;
        });

        if (!scrolled) break;
        scrollAttempts++;
        await this.waitFor(1000);
      }

      // Extract review data
      const reviews = await this.page.evaluate((maxReviews) => {
        const reviewElements = document.querySelectorAll('[data-review-id], div[class*="review" i][jslog], div[aria-label*="review" i]');
        const extractedReviews = [];

        for (let i = 0; i < Math.min(reviewElements.length, maxReviews); i++) {
          const reviewEl = reviewElements[i];

          try {
            // Extract reviewer name
            const nameEl = reviewEl.querySelector('[class*="name" i], [class*="author" i], div[class*="fontBodyMedium"]');
            const reviewerName = nameEl ? nameEl.textContent.trim() : 'Anonymous';

            // Extract rating
            let rating = null;
            const ratingEl = reviewEl.querySelector('[aria-label*="star"], [role="img"][aria-label*="star"]');
            if (ratingEl) {
              const ariaLabel = ratingEl.getAttribute('aria-label');
              const ratingMatch = ariaLabel.match(/(\d+)\s*star/i);
              if (ratingMatch) {
                rating = parseInt(ratingMatch[1]);
              }
            }

            // Extract review text
            let reviewText = '';
            const textEl = reviewEl.querySelector('[class*="review-text" i], span[class*="fontBodyMedium"], [jslog*="review"]');
            if (textEl) {
              reviewText = textEl.textContent.trim();
            }

            // If no specific review text element found, try to get text from the review container
            if (!reviewText) {
              const allText = reviewEl.textContent || '';
              // Try to extract meaningful text (skip short metadata)
              const lines = allText.split('\n').filter(line => line.trim().length > 20);
              if (lines.length > 0) {
                reviewText = lines[0].trim();
              }
            }

            // Extract date
            let date = '';
            const dateEl = reviewEl.querySelector('[class*="date" i], [class*="time" i]');
            if (dateEl) {
              date = dateEl.textContent.trim();
            }

            // Only add review if we have at least some data
            if (reviewerName || reviewText || rating) {
              extractedReviews.push({
                reviewerName: reviewerName || 'Anonymous',
                rating: rating,
                reviewText: reviewText || '',
                date: date || ''
              });
            }
          } catch (error) {
            console.log('Error extracting individual review:', error);
          }
        }

        return extractedReviews;
      }, maxReviews);

      console.log(`   ✅ Extracted ${reviews.length} reviews`);

      // Log sample of reviews for debugging
      if (reviews.length > 0) {
        console.log(`   📝 Sample review: "${reviews[0].reviewText.substring(0, 100)}..." - ${reviews[0].rating}⭐ by ${reviews[0].reviewerName}`);
      }

      return reviews;
    } catch (error) {
      console.log(`   ⚠️  Error extracting reviews: ${error.message}`);
      return [];
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
          'div[tabindex="-1"]',
          'div.m6QErb',
          'div[aria-label*="Results"]',
          '[class*="section-layout"]'
        ];

        let scrollableElement = null;
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.scrollHeight > element.clientHeight) {
            scrollableElement = element;
            break;
          }
        }

        if (!scrollableElement) {
          // Try to find any scrollable div
          const allDivs = document.querySelectorAll('div');
          for (const div of allDivs) {
            if (div.scrollHeight > div.clientHeight && div.clientHeight > 400) {
              scrollableElement = div;
              break;
            }
          }
        }

        if (scrollableElement) {
          const beforeScroll = scrollableElement.scrollTop;
          scrollableElement.scrollTop = scrollableElement.scrollHeight;
          const afterScroll = scrollableElement.scrollTop;
          return afterScroll > beforeScroll;
        }

        return false;
      });

      return scrolled;
    } catch (error) {
      console.log(`   ⚠️  Error scrolling: ${error.message}`);
      return false;
    }
  }

  async findBusinessElements() {
    const analysis = await this.analyzePageStructure();

    const selectorCandidates = [
      '[role="article"]',
      'div[data-result-index]',
      '[jsaction*="mouseover"]',
      'a[data-cid]',
      'div[data-cid]',
      'div[jsaction]'
    ];

    let bestSelector = null;
    let maxCount = 0;

    for (const selector of selectorCandidates) {
      if (analysis[selector] && analysis[selector].count > maxCount) {
        maxCount = analysis[selector].count;
        bestSelector = selector;
      }
    }

    if (bestSelector) {
      console.log(`✅ Using selector: ${bestSelector} (${maxCount} elements)`);
      return await this.page.$$(bestSelector);
    }

    console.log('🔄 No standard selectors found, trying dynamic approach...');

    const businessElements = await this.page.evaluate(() => {
      const allElements = document.querySelectorAll('div, a, span');
      const businessCandidates = [];

      Array.from(allElements).forEach(element => {
        const text = element.textContent || '';
        const hasBusinessKeywords = text.match(/plumbing|service|repair|company|llc|inc|corp|solutions|pro|expert|contractor/i);
        const hasStarRating = text.match(/\d+\.?\d*\s*star/i) || element.querySelector('[aria-label*="star"]');
        const isReasonableLength = text.length > 10 && text.length < 200;

        if ((hasBusinessKeywords || hasStarRating) && isReasonableLength) {
          let container = element;
          for (let i = 0; i < 5; i++) {
            if (container.parentElement) {
              container = container.parentElement;
            }
          }

          if (!businessCandidates.includes(container)) {
            businessCandidates.push(container);
          }
        }
      });

      return businessCandidates.slice(0, 20);
    });

    console.log(`🔍 Found ${businessElements.length} potential business containers using dynamic method`);
    return businessElements;
  }

  async extractBusinessInfo(businessElement) {
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
          'div[data-cid]',
          '[class*="qBF1Pd"]',
          'span[class*="fontBodyMedium"]'
        ];
        
        let businessName = getText(nameSelectors);
        
        if (!businessName) {
          const allText = element.textContent || '';
          const lines = allText.split('\n').filter(line => line.trim().length > 0);
          
          for (const line of lines) {
            if (line.match(/plumbing|service|repair|company|llc|inc|corp|solutions|pro|expert|contractor/i) &&
                line.length > 5 && line.length < 80 && !line.match(/\d+\.?\d*\s*star/i)) {
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
        
        return {
          name: businessName,
          rating: rating,
          reviewCount: reviewCount,
          address: '',
          phone: '',
          website: ''
        };
      } catch (error) {
        console.log('Error extracting business info:', error);
        return null;
      }
    }, businessElement);
  }

  async getBusinessesInArea(serviceType, city, state = '', options = {}) {
    const { minReviews = 5, maxBusinesses = 50 } = options;
    
    await this.searchServiceInArea(serviceType, city, state);
    
    console.log('📋 Extracting business listings...');
    console.log(`🎯 Looking specifically for businesses with 2.0-3.9 star ratings...`);
    console.log(`🔍 Minimum reviews required: ${minReviews}`);
    
    const businesses = [];
    let totalScanned = 0;
    let highRatedCount = 0;
    let lowRatedCount = 0;
    let perfectRatingCount = 0;
    
    const businessElements = await this.findBusinessElements();
    
    if (businessElements.length === 0) {
      throw new Error('No business elements found on the page.');
    }
    
    console.log(`📍 Found ${businessElements.length} potential business elements`);
    
    for (let i = 0; i < businessElements.length && businesses.length < maxBusinesses; i++) {
      const element = businessElements[i];
      
      try {
        const businessInfo = await this.extractBusinessInfo(element);
        
        if (businessInfo && businessInfo.name) {
          totalScanned++;
          
          const ratingText = businessInfo.rating ? `${businessInfo.rating}⭐` : 'No rating';
          const reviewText = businessInfo.reviewCount ? `(${businessInfo.reviewCount} reviews)` : '(No reviews)';
          
          console.log(`📊 #${totalScanned}: ${businessInfo.name} - ${ratingText} ${reviewText}`);
          
          if (businessInfo.rating) {
            if (businessInfo.rating >= 2 && businessInfo.rating <= 3.9) {
              if (businessInfo.reviewCount >= minReviews) {
                const isDuplicate = businesses.some(b => 
                  b.name === businessInfo.name
                );
                
                if (!isDuplicate) {
                  businesses.push({
                    ...businessInfo,
                    serviceType: serviceType,
                    searchLocation: `${city}${state ? ', ' + state : ''}`,
                    extractedAt: new Date().toISOString()
                  });
                  
                  perfectRatingCount++;
                  console.log(`✅ PERFECT LEAD #${perfectRatingCount}: ${businessInfo.name} (${businessInfo.rating}⭐, ${businessInfo.reviewCount} reviews) - GREAT FOR OUTREACH!`);
                } else {
                  console.log(`⚠️  DUPLICATE: ${businessInfo.name} - Already found`);
                }
              } else {
                console.log(`❌ NOT ENOUGH REVIEWS: ${businessInfo.name} (${businessInfo.rating}⭐) - Only ${businessInfo.reviewCount} reviews (need ${minReviews}+)`);
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

                  // NEW: Extract reviews from the business
                  console.log(`\n   ⭐ Extracting reviews for reputation management...`);
                  const reviews = await this.extractReviewsFromBusiness(10);
                  businessInfo.reviews = reviews;

                  // Analyze reviews for negative sentiment
                  const negativeReviews = reviews.filter(r => r.rating && r.rating <= 3);
                  const avgReviewRating = reviews.length > 0
                    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.filter(r => r.rating).length).toFixed(1)
                    : 'N/A';

                  console.log(`   📊 Reviews: ${reviews.length} total, ${negativeReviews.length} need addressing (${avgReviewRating}⭐ avg)`);

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

  // NEW: Export businesses to CSV with email column and review summary
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
      'Reviews Extracted',
      'Negative Reviews Count',
      'Sample Negative Review',
      'Extracted At'
    ];

    // Convert businesses to CSV rows
    const rows = businesses.map(business => {
      const reviews = business.reviews || [];
      const negativeReviews = reviews.filter(r => r.rating && r.rating <= 3);
      const sampleNegative = negativeReviews.length > 0
        ? negativeReviews[0].reviewText.substring(0, 200)
        : '';

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
        reviews.length || 0,
        negativeReviews.length || 0,
        `"${sampleNegative.replace(/"/g, '""')}"`,
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
      console.log(`⭐ Records with reviews: ${businesses.filter(b => b.reviews && b.reviews.length > 0).length}`);
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

    // NEW: Using enhanced method with email extraction, review scraping, and scrolling for restaurants
    const businesses = await scraper.getBusinessesInAreaExpanded(
      'restaurants',
      'Manchester',
      'UK',
      {
        minReviews: 5,
        maxBusinesses: 5, // Start with 5 to test
        minStars: 2.0, // Focus on 2.0-3.9 star range for reputation management
        maxStars: 3.9,
        extractEmails: true, // ENABLED: Extract emails for outreach
        maxScrolls: 20 // Increased scroll attempts to find lower-rated businesses with reviews
      }
    );

    console.log(`\n🎉 FINAL RESULTS: Found ${businesses.length} restaurants with 2.0-3.9 star ratings:`);

    if (businesses.length > 0) {
      businesses.forEach((business, i) => {
        console.log(`\n${i+1}. ${business.name}`);
        console.log(`   ⭐ Rating: ${business.rating} (${business.reviewCount} reviews)`);
        console.log(`   📍 Address: ${business.address || 'Not found'}`);
        console.log(`   📞 Phone: ${business.phone || 'Not found'}`);
        console.log(`   🌐 Website: ${business.website || 'Not found'}`);
        console.log(`   📧 Email: ${business.email || 'Not found'}`);
        console.log(`   📝 Reviews extracted: ${business.reviews?.length || 0}`);
        if (business.reviews && business.reviews.length > 0) {
          const negativeReviews = business.reviews.filter(r => r.rating && r.rating <= 3);
          console.log(`   ⚠️  Negative reviews: ${negativeReviews.length}`);
        }
        console.log(`   💡 Outreach opportunity: Perfect for reputation management!`);
      });

      // NEW: Export to CSV with email and review columns
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const csvFilename = `restaurants_manchester_${timestamp}.csv`;
      const jsonFilename = `restaurants_manchester_${timestamp}.json`;

      scraper.exportToCSV(businesses, csvFilename);
      scraper.exportToJSON(businesses, jsonFilename);

      console.log(`\n✅ Results exported successfully!`);
      console.log(`\n📧 Next step: Import the CSV into the email campaign sender`);
      console.log(`   Use template: reputation-management.html`);

    } else {
      console.log('\n📝 No restaurants found with 2.0-3.9 star ratings.');
      console.log('💡 Try a different city or lower the minReviews requirement.');
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