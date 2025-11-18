const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class VisibleUKRestaurantScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.foundBusinesses = new Set();
    this.targetBusinessCount = 30; // Changed from 50 to 30
    this.maxSearchesPerCity = 5;
    this.currentRun = 0;
    this.repairLeads = [];
    this.growthLeads = [];
    this.usedSearchTerms = new Set();
    this.scrapedBusinessNames = new Set();
  }

  // Load previously scraped businesses to avoid duplicates
  async loadPreviouslyScrapedBusinesses() {
    try {
      const dir = './restaurant_leads';
      if (!fs.existsSync(dir)) {
        return;
      }

      const files = fs.readdirSync(dir).filter(file => file.endsWith('.json'));
      
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
          if (data.allLeads) {
            data.allLeads.forEach(lead => {
              this.scrapedBusinessNames.add(lead.name.toLowerCase().trim());
            });
          }
        } catch (e) {
          console.log(`Could not load previous data from ${file}`);
        }
      }

      console.log(`📋 Loaded ${this.scrapedBusinessNames.size} previously scraped businesses to avoid duplicates`);
    } catch (error) {
      console.log('No previous data found, starting fresh');
    }
  }

  // Expanded search terms with variations to find different businesses
  generateRepairSearchTerms(city) {
    const baseTerms = [
      `bad restaurants ${city}`,
      `worst restaurants ${city}`, 
      `cheap restaurants ${city}`,
      `low rated restaurants ${city}`,
      `1 star restaurants ${city}`,
      `2 star restaurants ${city}`,
      `poor service restaurants ${city}`,
      `budget restaurants ${city}`,
      `struggling restaurants ${city}`,
      `takeaway ${city} poor`,
      `fast food ${city} bad`,
      `chinese restaurants ${city} terrible`,
      `indian restaurants ${city} awful`,
      `pizza places ${city} disappointing`,
      `kebab shops ${city} poor`
    ];

    // Add location variations to find different areas
    const areaVariations = [
      `restaurants near ${city} city centre`,
      `restaurants ${city} town center`,
      `restaurants ${city} high street`,
      `restaurants ${city} center bad`,
      `takeaway ${city} delivery poor`,
      `food ${city} terrible service`,
      `dining ${city} disappointing`,
      `eateries ${city} low quality`,
      `cafes ${city} poor reviews`,
      `bistros ${city} bad`,
      `pubs ${city} food terrible`,
      `bars ${city} food poor`,
      `grills ${city} disappointing`,
      `diners ${city} bad service`
    ];

    // Add specific cuisine searches
    const cuisineSearches = [
      `italian restaurants ${city} poor`,
      `mexican restaurants ${city} bad`,
      `thai restaurants ${city} terrible`,
      `american restaurants ${city} disappointing`,
      `fish and chips ${city} poor`,
      `curry house ${city} bad`,
      `noodle bar ${city} terrible`,
      `burger place ${city} poor`,
      `steakhouse ${city} disappointing`,
      `sandwich shop ${city} bad`
    ];

    return [...baseTerms, ...areaVariations, ...cuisineSearches];
  }

  generateGrowthSearchTerms(city) {
    const baseTerms = [
      `new restaurants ${city}`,
      `recently opened restaurants ${city}`,
      `hidden gem restaurants ${city}`,
      `small restaurants ${city}`,
      `family owned restaurants ${city}`,
      `local restaurants ${city}`,
      `neighborhood restaurants ${city}`,
      `hole in the wall ${city}`,
      `authentic restaurants ${city}`,
      `home style restaurants ${city}`,
      `traditional restaurants ${city}`,
      `mom and pop restaurants ${city}`,
      `cozy restaurants ${city}`,
      `intimate restaurants ${city}`,
      `independent restaurants ${city}`
    ];

    // Add location-specific searches
    const areaVariations = [
      `best kept secret restaurants ${city}`,
      `underrated restaurants ${city}`,
      `local favorite restaurants ${city}`,
      `family business restaurants ${city}`,
      `artisan food ${city}`,
      `craft restaurants ${city}`,
      `boutique dining ${city}`,
      `specialty restaurants ${city}`,
      `niche restaurants ${city}`,
      `unique restaurants ${city}`,
      `original restaurants ${city}`,
      `fresh restaurants ${city}`,
      `innovative restaurants ${city}`,
      `creative dining ${city}`
    ];

    // Add specific cuisine searches for high-quality small places
    const cuisineSearches = [
      `authentic italian ${city} family`,
      `genuine chinese ${city} small`,
      `real indian ${city} local`,
      `traditional thai ${city} family`,
      `artisan pizza ${city}`,
      `handmade pasta ${city}`,
      `homemade food ${city}`,
      `farm to table ${city}`,
      `organic restaurant ${city}`,
      `fresh food ${city} local`
    ];

    return [...baseTerms, ...areaVariations, ...cuisineSearches];
  }

  async waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    console.log('🚀 Initializing VISIBLE UK Restaurant Scraper...');
    console.log('👀 Browser will open for monitoring...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      devtools: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const pages = await this.browser.pages();
    this.page = pages[0];
    
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
    });
    
    this.page.setDefaultTimeout(60000);
    this.page.setDefaultNavigationTimeout(60000);
  }

  getUKCities() {
    return [
      'Birmingham',
      'Manchester', 
      'Liverpool',
      'Leeds',
      'Sheffield',
      'Bristol',
      'Newcastle',
      'Leicester',
      'Coventry',
      'Bradford',
      'Hull',
      'Stoke-on-Trent',
      'Wolverhampton',
      'Plymouth',
      'Derby',
      'Southampton',
      'Swansea',
      'Cardiff',
      'Belfast',
      'Glasgow',
      'Edinburgh'
    ];
  }

  generateRepairSearchTerms(city) {
    return [
      `bad restaurants ${city}`,
      `worst restaurants ${city}`, 
      `cheap restaurants ${city}`,
      `low rated restaurants ${city}`,
      `1 star restaurants ${city}`,
      `2 star restaurants ${city}`,
      `poor service restaurants ${city}`,
      `budget restaurants ${city}`,
      `struggling restaurants ${city}`,
      `takeaway ${city} poor`,
      `fast food ${city} bad`,
      `chinese restaurants ${city} terrible`,
      `indian restaurants ${city} awful`,
      `pizza places ${city} disappointing`,
      `kebab shops ${city} poor`
    ];
  }

  generateGrowthSearchTerms(city) {
    return [
      `new restaurants ${city}`,
      `recently opened restaurants ${city}`,
      `hidden gem restaurants ${city}`,
      `small restaurants ${city}`,
      `family owned restaurants ${city}`,
      `local restaurants ${city}`,
      `neighborhood restaurants ${city}`,
      `hole in the wall ${city}`,
      `authentic restaurants ${city}`,
      `home style restaurants ${city}`,
      `traditional restaurants ${city}`,
      `mom and pop restaurants ${city}`,
      `cozy restaurants ${city}`,
      `intimate restaurants ${city}`,
      `independent restaurants ${city}`
    ];
  }

  async extractRepairLeads() {
    console.log('🔍 Extracting ALL restaurants first, then filtering for REPAIR leads...');
    
    await this.waitFor(3000);
    
    const businesses = await this.page.evaluate(() => {
      const businesses = [];
      
      console.log('🔍 Starting extraction process...');
      
      const businessSelectors = [
        '[data-result-index]',
        '.VkpGBb',
        '.Nv2PK', 
        '.g',
        '[class*="VkpGBb"]',
        '[class*="Nv2PK"]',
        '.tF2Cxc',
        '.MjjYud',
        '.rllt__link',
        '.uEierd'
      ];
      
      let businessElements = [];
      for (const selector of businessSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          businessElements = Array.from(elements);
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          break;
        }
      }
      
      if (businessElements.length === 0) {
        businessElements = Array.from(document.querySelectorAll('div')).filter(div => {
          const text = div.textContent || '';
          const hasRestaurantContent = text.includes('★') || 
                  text.includes('star') || 
                  text.includes('review') ||
                  text.match(/\d+\.?\d*\s*\/\s*5/) ||
                  text.includes('Restaurant') ||
                  text.includes('Cafe') ||
                  text.includes('Takeaway');
          return hasRestaurantContent && text.length > 30;
        });
        console.log(`Fallback: Found ${businessElements.length} potential business elements`);
      }

      console.log(`Processing ${businessElements.length} elements...`);

      for (let i = 0; i < businessElements.length && businesses.length < 20; i++) {
        const element = businessElements[i];
        const text = element.textContent || '';
        
        if (text.length < 30) continue;
        
        console.log(`Processing element ${i + 1}: "${text.substring(0, 100)}..."`);
        
        let rating = null;
        
        const ratingPatterns = [
          /(\d+\.?\d*)\s*★/,
          /★\s*(\d+\.?\d*)/,
          /(\d+\.?\d*)\s*star/i,
          /(\d+\.?\d*)\s*out\s*of\s*5/i,
          /Rating:\s*(\d+\.?\d*)/i,
          /(\d+\.?\d*)\s*\/\s*5/,
          /(\d+\.?\d*)\s*\(\d+\)/
        ];
        
        for (const pattern of ratingPatterns) {
          const match = text.match(pattern);
          if (match) {
            const parsedRating = parseFloat(match[1]);
            if (!isNaN(parsedRating) && parsedRating >= 0 && parsedRating <= 5) {
              rating = parsedRating;
              console.log(`Found rating via pattern: ${rating}`);
              break;
            }
          }
        }
        
        if (!rating) {
          const starElements = element.querySelectorAll('[aria-label*="star"], [title*="star"], [alt*="star"]');
          for (const starEl of starElements) {
            const ariaLabel = starEl.getAttribute('aria-label') || starEl.getAttribute('title') || starEl.getAttribute('alt') || '';
            const starMatch = ariaLabel.match(/(\d+\.?\d*)\s*(star|rating)/i);
            if (starMatch) {
              const parsedRating = parseFloat(starMatch[1]);
              if (!isNaN(parsedRating) && parsedRating >= 0 && parsedRating <= 5) {
                rating = parsedRating;
                console.log(`Found rating via aria-label: ${rating}`);
                break;
              }
            }
          }
        }

        if (rating === null) {
          console.log(`No rating found for element ${i + 1}`);
          continue;
        }

        let reviewCount = 0;
        const reviewPatterns = [
          /\((\d+(?:,\d+)*)\s*review/i,
          /(\d+(?:,\d+)*)\s*review/i,
          /\((\d+(?:,\d+)*)\)/,
          /(\d+(?:,\d+)*)\s*Google\s*review/i,
          /(\d+(?:,\d+)*)\s*rating/i,
          /★\s*\d+\.?\d*\s*\((\d+(?:,\d+)*)\)/
        ];
        
        for (const pattern of reviewPatterns) {
          const match = text.match(pattern);
          if (match) {
            const parsedCount = parseInt(match[1].replace(/,/g, ''));
            if (!isNaN(parsedCount) && parsedCount > 0) {
              reviewCount = parsedCount;
              console.log(`Found ${reviewCount} reviews`);
              break;
            }
          }
        }

        let businessName = '';
        
        const nameSelectors = [
          'h3',
          'h2', 
          'h1',
          '[role="heading"]',
          '.LC20lb',
          '.DKV0Md',
          '[class*="fontHeadlineSmall"]',
          'a[data-cid] span',
          '.qBF1Pd',
          '.rllt__link',
          '.uEierd h3'
        ];
        
        for (const selector of nameSelectors) {
          const nameEl = element.querySelector(selector);
          if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
            const name = nameEl.textContent.trim();
            if (name.length > 2 && name.length < 100 && !name.includes('Google') && !name.includes('Maps')) {
              businessName = name;
              console.log(`Found business name via selector: ${businessName}`);
              break;
            }
          }
        }
        
        if (!businessName) {
          const lines = text.split('\n').filter(line => line.trim().length > 0);
          for (const line of lines) {
            const trimmedLine = line.trim();
            const isValidName = trimmedLine.length > 3 && 
                trimmedLine.length < 80 && 
                !trimmedLine.match(/\d+\.?\d*\s*star/i) &&
                !trimmedLine.match(/\d+\.?\d*\s*★/i) &&
                !trimmedLine.match(/^\d+\s*(review|min|hour|day)/i) &&
                !trimmedLine.match(/^(open|closed|directions|call|website|hours)/i) &&
                !trimmedLine.includes('Google') &&
                !trimmedLine.match(/^[\d\s\-\(\)]+$/) &&
                !trimmedLine.match(/^\d+\.?\d*\s*\/\s*5/) &&
                !trimmedLine.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
            
            if (isValidName) {
              businessName = trimmedLine;
              console.log(`Found business name via text parsing: ${businessName}`);
              break;
            }
          }
        }

        if (!businessName || businessName.length < 3) {
          console.log(`No valid business name found for element ${i + 1}`);
          continue;
        }

        let googleMapsUrl = '';
        
        // Method 1: Look for direct Google Maps links
        const linkElements = element.querySelectorAll('a[href]');
        for (const linkEl of linkElements) {
          const href = linkEl.getAttribute('href');
          if (href) {
            // Check for various Google Maps URL patterns
            if (href.includes('maps.google') || 
                href.includes('/maps/place/') || 
                href.includes('/maps/dir/') ||
                href.includes('ludocid=') ||
                href.includes('cid=') ||
                href.includes('@') && href.includes('data=')) {
              googleMapsUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
              console.log(`Found Google Maps URL: ${googleMapsUrl}`);
              break;
            }
          }
        }
        
        // Method 2: Look for data-cid attributes and construct URL
        if (!googleMapsUrl) {
          const cidElements = element.querySelectorAll('[data-cid]');
          for (const cidEl of cidElements) {
            const cid = cidEl.getAttribute('data-cid');
            if (cid) {
              googleMapsUrl = `https://www.google.com/maps/place/?cid=${cid}`;
              console.log(`Constructed Google Maps URL from CID: ${googleMapsUrl}`);
              break;
            }
          }
        }
        
        // Method 3: Look for any link that might lead to the business page
        if (!googleMapsUrl) {
          for (const linkEl of linkElements) {
            const href = linkEl.getAttribute('href');
            if (href && (href.includes('/url?') || href.includes('google'))) {
              // Try to decode URL if it's encoded
              try {
                const url = new URL(href.startsWith('http') ? href : `https://www.google.com${href}`);
                if (url.searchParams.get('url')) {
                  const decodedUrl = decodeURIComponent(url.searchParams.get('url'));
                  if (decodedUrl.includes('maps') || decodedUrl.includes('place')) {
                    googleMapsUrl = decodedUrl;
                    console.log(`Found decoded Google Maps URL: ${googleMapsUrl}`);
                    break;
                  }
                }
              } catch (e) {
                // Continue if URL parsing fails
              }
            }
          }
        }
        
        // Method 4: Construct search URL as fallback
        if (!googleMapsUrl && businessName) {
          const encodedName = encodeURIComponent(businessName);
          googleMapsUrl = `https://www.google.com/maps/search/${encodedName}`;
          console.log(`Created fallback search URL: ${googleMapsUrl}`);
        }

        let address = '';
        const addressPatterns = [
          /([A-Za-z0-9\s,'-]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Close|Cl|Court|Ct|Square|Sq|Way)[A-Za-z0-9\s,'-]*)/i,
          /([A-Za-z0-9\s,'-]+(?:Birmingham|Manchester|Liverpool|Leeds|Bristol|Newcastle|Sheffield|Cardiff|Glasgow|Edinburgh|London)[A-Za-z0-9\s,'-]*)/i
        ];
        
        for (const pattern of addressPatterns) {
          const addressMatch = text.match(pattern);
          if (addressMatch) {
            address = addressMatch[1].trim();
            if (address.length > 10 && address.length < 100) {
              break;
            }
          }
        }

        let phoneNumber = '';
        const phonePatterns = [
          /(\+44\s?\d{2,4}\s?\d{3,4}\s?\d{3,4})/,
          /(0\d{2,4}\s?\d{3,4}\s?\d{3,4})/,
          /(\d{5}\s?\d{6})/
        ];
        
        for (const pattern of phonePatterns) {
          const phoneMatch = text.match(pattern);
          if (phoneMatch) {
            phoneNumber = phoneMatch[1];
            break;
          }
        }

        let businessType = '';
        const typePatterns = [
          /(Restaurant|Takeaway|Cafe|Fast food|Pizza|Chinese|Indian|Thai|Italian|Fish and chips|Kebab)/i,
          /·\s*([A-Za-z\s]+)\s*·/
        ];
        
        for (const pattern of typePatterns) {
          const typeMatch = text.match(pattern);
          if (typeMatch) {
            businessType = typeMatch[1].trim();
            break;
          }
        }

        // Apply repair lead filter (2.0-3.9 stars, min 3 reviews)
        if (rating >= 2.0 && rating <= 3.9 && reviewCount >= 3) {
          let urgencyLevel = 'MEDIUM';
          if (rating < 2.5) urgencyLevel = 'CRITICAL';
          else if (rating < 3.0) urgencyLevel = 'HIGH';

          const business = {
            name: businessName,
            rating: rating,
            reviewCount: reviewCount,
            googleMapsUrl: googleMapsUrl,
            address: address,
            phoneNumber: phoneNumber,
            businessType: businessType,
            leadType: 'REPUTATION_REPAIR',
            urgencyLevel: urgencyLevel,
            extractedAt: new Date().toISOString()
          };

          businesses.push(business);
          console.log(`🚨 REPAIR LEAD FOUND: ${businessName} - ${rating}⭐ (${reviewCount} reviews) - ${urgencyLevel}`);
        } else {
          if (rating < 2.0) {
            console.log(`❌ Rating too low for repair: ${businessName} - ${rating}⭐`);
          } else if (rating > 3.9) {
            console.log(`❌ Rating too high for repair: ${businessName} - ${rating}⭐`);
          } else if (reviewCount < 3) {
            console.log(`❌ Not enough reviews for repair: ${businessName} - ${reviewCount} reviews`);
          }
        }
      }

      console.log(`Final repair leads extracted: ${businesses.length}`);
      return businesses;
    });

    return businesses;
  }

  async extractGrowthLeads() {
    console.log('🔍 Extracting ALL restaurants first, then filtering for GROWTH leads...');
    
    await this.waitFor(3000);
    
    const businesses = await this.page.evaluate(() => {
      const businesses = [];
      
      console.log('🔍 Starting growth extraction process...');
      
      const businessSelectors = [
        '[data-result-index]',
        '.VkpGBb',
        '.Nv2PK', 
        '.g',
        '[class*="VkpGBb"]',
        '[class*="Nv2PK"]',
        '.tF2Cxc',
        '.MjjYud',
        '.rllt__link',
        '.uEierd'
      ];
      
      let businessElements = [];
      for (const selector of businessSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          businessElements = Array.from(elements);
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          break;
        }
      }
      
      if (businessElements.length === 0) {
        businessElements = Array.from(document.querySelectorAll('div')).filter(div => {
          const text = div.textContent || '';
          const hasRestaurantContent = text.includes('★') || 
                  text.includes('star') || 
                  text.includes('review') ||
                  text.match(/\d+\.?\d*\s*\/\s*5/) ||
                  text.includes('Restaurant') ||
                  text.includes('Cafe') ||
                  text.includes('Takeaway');
          return hasRestaurantContent && text.length > 30;
        });
        console.log(`Fallback: Found ${businessElements.length} potential business elements`);
      }

      console.log(`Processing ${businessElements.length} elements for growth leads...`);

      for (let i = 0; i < businessElements.length && businesses.length < 20; i++) {
        const element = businessElements[i];
        const text = element.textContent || '';
        
        if (text.length < 30) continue;
        
        console.log(`Processing element ${i + 1}: "${text.substring(0, 100)}..."`);
        
        let rating = null;
        
        const ratingPatterns = [
          /(\d+\.?\d*)\s*★/,
          /★\s*(\d+\.?\d*)/,
          /(\d+\.?\d*)\s*star/i,
          /(\d+\.?\d*)\s*out\s*of\s*5/i,
          /Rating:\s*(\d+\.?\d*)/i,
          /(\d+\.?\d*)\s*\/\s*5/,
          /(\d+\.?\d*)\s*\(\d+\)/
        ];
        
        for (const pattern of ratingPatterns) {
          const match = text.match(pattern);
          if (match) {
            const parsedRating = parseFloat(match[1]);
            if (!isNaN(parsedRating) && parsedRating >= 0 && parsedRating <= 5) {
              rating = parsedRating;
              console.log(`Found rating via pattern: ${rating}`);
              break;
            }
          }
        }
        
        if (!rating) {
          const starElements = element.querySelectorAll('[aria-label*="star"], [title*="star"], [alt*="star"]');
          for (const starEl of starElements) {
            const ariaLabel = starEl.getAttribute('aria-label') || starEl.getAttribute('title') || starEl.getAttribute('alt') || '';
            const starMatch = ariaLabel.match(/(\d+\.?\d*)\s*(star|rating)/i);
            if (starMatch) {
              const parsedRating = parseFloat(starMatch[1]);
              if (!isNaN(parsedRating) && parsedRating >= 0 && parsedRating <= 5) {
                rating = parsedRating;
                console.log(`Found rating via aria-label: ${rating}`);
                break;
              }
            }
          }
        }

        if (rating === null) {
          console.log(`No rating found for element ${i + 1}`);
          continue;
        }

        let reviewCount = 0;
        const reviewPatterns = [
          /\((\d+(?:,\d+)*)\s*review/i,
          /(\d+(?:,\d+)*)\s*review/i,
          /\((\d+(?:,\d+)*)\)/,
          /(\d+(?:,\d+)*)\s*Google\s*review/i,
          /(\d+(?:,\d+)*)\s*rating/i,
          /★\s*\d+\.?\d*\s*\((\d+(?:,\d+)*)\)/
        ];
        
        for (const pattern of reviewPatterns) {
          const match = text.match(pattern);
          if (match) {
            const parsedCount = parseInt(match[1].replace(/,/g, ''));
            if (!isNaN(parsedCount) && parsedCount > 0) {
              reviewCount = parsedCount;
              console.log(`Found ${reviewCount} reviews`);
              break;
            }
          }
        }

        let businessName = '';
        
        const nameSelectors = [
          'h3',
          'h2', 
          'h1',
          '[role="heading"]',
          '.LC20lb',
          '.DKV0Md',
          '[class*="fontHeadlineSmall"]',
          'a[data-cid] span',
          '.qBF1Pd',
          '.rllt__link',
          '.uEierd h3'
        ];
        
        for (const selector of nameSelectors) {
          const nameEl = element.querySelector(selector);
          if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
            const name = nameEl.textContent.trim();
            if (name.length > 2 && name.length < 100 && !name.includes('Google') && !name.includes('Maps')) {
              businessName = name;
              console.log(`Found business name via selector: ${businessName}`);
              break;
            }
          }
        }
        
        if (!businessName) {
          const lines = text.split('\n').filter(line => line.trim().length > 0);
          for (const line of lines) {
            const trimmedLine = line.trim();
            const isValidName = trimmedLine.length > 3 && 
                trimmedLine.length < 80 && 
                !trimmedLine.match(/\d+\.?\d*\s*star/i) &&
                !trimmedLine.match(/\d+\.?\d*\s*★/i) &&
                !trimmedLine.match(/^\d+\s*(review|min|hour|day)/i) &&
                !trimmedLine.match(/^(open|closed|directions|call|website|hours)/i) &&
                !trimmedLine.includes('Google') &&
                !trimmedLine.match(/^[\d\s\-\(\)]+$/) &&
                !trimmedLine.match(/^\d+\.?\d*\s*\/\s*5/) &&
                !trimmedLine.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
            
            if (isValidName) {
              businessName = trimmedLine;
              console.log(`Found business name via text parsing: ${businessName}`);
              break;
            }
          }
        }

        if (!businessName || businessName.length < 3) {
          console.log(`No valid business name found for element ${i + 1}`);
          continue;
        }

        let googleMapsUrl = '';
        
        // Method 1: Look for direct Google Maps links
        const linkElements = element.querySelectorAll('a[href]');
        for (const linkEl of linkElements) {
          const href = linkEl.getAttribute('href');
          if (href) {
            // Check for various Google Maps URL patterns
            if (href.includes('maps.google') || 
                href.includes('/maps/place/') || 
                href.includes('/maps/dir/') ||
                href.includes('ludocid=') ||
                href.includes('cid=') ||
                href.includes('@') && href.includes('data=')) {
              googleMapsUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
              console.log(`Found Google Maps URL: ${googleMapsUrl}`);
              break;
            }
          }
        }
        
        // Method 2: Look for data-cid attributes and construct URL
        if (!googleMapsUrl) {
          const cidElements = element.querySelectorAll('[data-cid]');
          for (const cidEl of cidElements) {
            const cid = cidEl.getAttribute('data-cid');
            if (cid) {
              googleMapsUrl = `https://www.google.com/maps/place/?cid=${cid}`;
              console.log(`Constructed Google Maps URL from CID: ${googleMapsUrl}`);
              break;
            }
          }
        }
        
        // Method 3: Look for any link that might lead to the business page
        if (!googleMapsUrl) {
          for (const linkEl of linkElements) {
            const href = linkEl.getAttribute('href');
            if (href && (href.includes('/url?') || href.includes('google'))) {
              // Try to decode URL if it's encoded
              try {
                const url = new URL(href.startsWith('http') ? href : `https://www.google.com${href}`);
                if (url.searchParams.get('url')) {
                  const decodedUrl = decodeURIComponent(url.searchParams.get('url'));
                  if (decodedUrl.includes('maps') || decodedUrl.includes('place')) {
                    googleMapsUrl = decodedUrl;
                    console.log(`Found decoded Google Maps URL: ${googleMapsUrl}`);
                    break;
                  }
                }
              } catch (e) {
                // Continue if URL parsing fails
              }
            }
          }
        }
        
        // Method 4: Construct search URL as fallback
        if (!googleMapsUrl && businessName) {
          const encodedName = encodeURIComponent(businessName);
          googleMapsUrl = `https://www.google.com/maps/search/${encodedName}`;
          console.log(`Created fallback search URL: ${googleMapsUrl}`);
        }

        let address = '';
        const addressPatterns = [
          /([A-Za-z0-9\s,'-]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Close|Cl|Court|Ct|Square|Sq|Way)[A-Za-z0-9\s,'-]*)/i,
          /([A-Za-z0-9\s,'-]+(?:Birmingham|Manchester|Liverpool|Leeds|Bristol|Newcastle|Sheffield|Cardiff|Glasgow|Edinburgh|London)[A-Za-z0-9\s,'-]*)/i
        ];
        
        for (const pattern of addressPatterns) {
          const addressMatch = text.match(pattern);
          if (addressMatch) {
            address = addressMatch[1].trim();
            if (address.length > 10 && address.length < 100) {
              break;
            }
          }
        }

        let phoneNumber = '';
        const phonePatterns = [
          /(\+44\s?\d{2,4}\s?\d{3,4}\s?\d{3,4})/,
          /(0\d{2,4}\s?\d{3,4}\s?\d{3,4})/,
          /(\d{5}\s?\d{6})/
        ];
        
        for (const pattern of phonePatterns) {
          const phoneMatch = text.match(pattern);
          if (phoneMatch) {
            phoneNumber = phoneMatch[1];
            break;
          }
        }

        let businessType = '';
        const typePatterns = [
          /(Restaurant|Takeaway|Cafe|Fast food|Pizza|Chinese|Indian|Thai|Italian|Fish and chips|Kebab)/i,
          /·\s*([A-Za-z\s]+)\s*·/
        ];
        
        for (const pattern of typePatterns) {
          const typeMatch = text.match(pattern);
          if (typeMatch) {
            businessType = typeMatch[1].trim();
            break;
          }
        }

        // Apply growth lead filter (4.0-5.0 stars, 10-50 reviews)
        if (rating >= 4.0 && rating <= 5.0 && reviewCount >= 10 && reviewCount <= 50) {
          let growthPotential = 'MEDIUM';
          if (reviewCount <= 20) growthPotential = 'HIGH';
          else if (reviewCount <= 30) growthPotential = 'GOOD';

          const business = {
            name: businessName,
            rating: rating,
            reviewCount: reviewCount,
            googleMapsUrl: googleMapsUrl,
            address: address,
            phoneNumber: phoneNumber,
            businessType: businessType,
            leadType: 'REVIEW_GROWTH',
            growthPotential: growthPotential,
            extractedAt: new Date().toISOString()
          };

          businesses.push(business);
          console.log(`📈 GROWTH LEAD FOUND: ${businessName} - ${rating}⭐ (${reviewCount} reviews) - ${growthPotential} POTENTIAL`);
        } else {
          if (rating < 4.0) {
            console.log(`❌ Rating too low for growth: ${businessName} - ${rating}⭐`);
          } else if (rating > 5.0) {
            console.log(`❌ Rating too high for growth: ${businessName} - ${rating}⭐`);
          } else if (reviewCount < 10) {
            console.log(`❌ Too few reviews for growth: ${businessName} - ${reviewCount} reviews`);
          } else if (reviewCount > 50) {
            console.log(`❌ Too many reviews for growth: ${businessName} - ${reviewCount} reviews`);
          }
        }
      }

      console.log(`Final growth leads extracted: ${businesses.length}`);
      return businesses;
    });

    return businesses;
  }

  async searchMultipleUKCities(options = {}) {
    const {
      maxBusinesses = 50,
      citiesCount = 6
    } = options;

    console.log(`\n🇬🇧 COMPREHENSIVE UK RESTAURANT OPPORTUNITY SEARCH`);
    console.log(`🎯 Target: ${maxBusinesses} restaurant opportunities from ${citiesCount} UK cities`);
    console.log(`🚨 Repair Leads: 2.0-3.9 stars (min 3 reviews)`);
    console.log(`📈 Growth Leads: 4.0-5.0 stars (10-50 reviews)`);
    
    const cities = this.getUKCities().slice(0, citiesCount);
    this.repairLeads = [];
    this.growthLeads = [];
    const foundNames = new Set();
    
    for (let cityIndex = 0; cityIndex < cities.length; cityIndex++) {
      const totalLeads = this.repairLeads.length + this.growthLeads.length;
      if (totalLeads >= maxBusinesses) {
        console.log(`✅ Target reached: ${totalLeads} total opportunities found`);
        break;
      }
      
      const city = cities[cityIndex];
      console.log(`\n🏙️  City ${cityIndex + 1}/${cities.length}: ${city}`);
      
      // PHASE 1: Search for REPAIR leads
      console.log(`  🚨 Phase 1: Repair Lead Search`);
      const repairSearchTerms = this.generateRepairSearchTerms(city);
      const shuffledRepairTerms = repairSearchTerms.sort(() => Math.random() - 0.5).slice(0, 3);
      
      for (let searchIndex = 0; searchIndex < shuffledRepairTerms.length; searchIndex++) {
        if (this.repairLeads.length >= maxBusinesses / 2) break;
        
        const searchTerm = shuffledRepairTerms[searchIndex];
        console.log(`     🔍 Repair Search ${searchIndex + 1}/3: "${searchTerm}"`);
        
        try {
          const searchUrl = `https://www.google.co.uk/search?q=${encodeURIComponent(searchTerm)}&tbm=lcl`;
          console.log(`     🌐 Loading: ${searchUrl}`);
          
          await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
          
          try {
            await this.waitFor(2000);
            const consentSelectors = ['#L2AGLb', 'button[aria-label*="Accept"]', '[data-testid="accept-all"]'];
            for (const selector of consentSelectors) {
              try {
                const button = await this.page.$(selector);
                if (button) {
                  console.log(`     🍪 Accepting cookies...`);
                  await button.click();
                  await this.waitFor(2000);
                  break;
                }
              } catch (e) {}
            }
          } catch (e) {}
          
          const businesses = await this.extractRepairLeads();
          
          for (const business of businesses) {
            const nameKey = business.name.toLowerCase().trim();
            
            if (!foundNames.has(nameKey)) {
              foundNames.add(nameKey);
              this.repairLeads.push(business);
              newBusinessesAdded++;
              
              if (this.repairLeads.length >= maxBusinesses / 2) break;
            }
          }
          
          console.log(`     📊 Found ${businesses.length} repair results, added ${newBusinessesAdded} new`);
          
          await this.waitFor(3000 + Math.random() * 2000);
          
        } catch (error) {
          console.log(`     ❌ Repair search failed: ${error.message}`);
          await this.waitFor(5000);
        }
      }
      
      // PHASE 2: Search for GROWTH leads  
      console.log(`  📈 Phase 2: Growth Lead Search`);
      const growthSearchTerms = this.generateGrowthSearchTerms(city);
      const shuffledGrowthTerms = growthSearchTerms.sort(() => Math.random() - 0.5).slice(0, 3);
      
      for (let searchIndex = 0; searchIndex < shuffledGrowthTerms.length; searchIndex++) {
        if (this.growthLeads.length >= maxBusinesses / 2) break;
        
        const searchTerm = shuffledGrowthTerms[searchIndex];
        console.log(`     🔍 Growth Search ${searchIndex + 1}/3: "${searchTerm}"`);
        
        try {
          const searchUrl = `https://www.google.co.uk/search?q=${encodeURIComponent(searchTerm)}&tbm=lcl`;
          console.log(`     🌐 Loading: ${searchUrl}`);
          
          await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
          
          const businesses = await this.extractGrowthLeads();
          
          let newBusinessesAdded = 0;
          for (const business of businesses) {
            const nameKey = business.name.toLowerCase().trim();
            
            if (!foundNames.has(nameKey)) {
              foundNames.add(nameKey);
              this.growthLeads.push(business);
              newBusinessesAdded++;
              
              if (this.growthLeads.length >= maxBusinesses / 2) break;
            }
          }
          
          console.log(`     📊 Found ${businesses.length} growth results, added ${newBusinessesAdded} new`);
          
          await this.waitFor(3000 + Math.random() * 2000);
          
        } catch (error) {
          console.log(`     ❌ Growth search failed: ${error.message}`);
          await this.waitFor(5000);
        }
      }
      
      const totalLeadsAfterCity = this.repairLeads.length + this.growthLeads.length;
      console.log(`   🏙️  ${city} complete:`);
      console.log(`     🚨 Repair leads: ${this.repairLeads.length}`);
      console.log(`     📈 Growth leads: ${this.growthLeads.length}`);
      console.log(`     📊 Total: ${totalLeadsAfterCity} opportunities`);
    }
    
    const allLeads = [...this.repairLeads, ...this.growthLeads];
    return allLeads;
  }

  async saveMultiCityResults(allLeads) {
    const currentDate = new Date();
    this.currentRun++;
    
    const repairLeads = allLeads.filter(b => b.leadType === 'REPUTATION_REPAIR');
    const growthLeads = allLeads.filter(b => b.leadType === 'REVIEW_GROWTH');
    
    const summary = {
      repairLeads: {
        count: repairLeads.length,
        critical: repairLeads.filter(b => b.urgencyLevel === 'CRITICAL').length,
        high: repairLeads.filter(b => b.urgencyLevel === 'HIGH').length,
        medium: repairLeads.filter(b => b.urgencyLevel === 'MEDIUM').length,
        avgRating: repairLeads.length > 0 ? 
          (repairLeads.reduce((sum, b) => sum + b.rating, 0) / repairLeads.length).toFixed(2) : '0.00',
        avgReviews: repairLeads.length > 0 ? 
          Math.round(repairLeads.reduce((sum, b) => sum + b.reviewCount, 0) / repairLeads.length) : 0
      },
      growthLeads: {
        count: growthLeads.length,
        highPotential: growthLeads.filter(b => b.growthPotential === 'HIGH').length,
        goodPotential: growthLeads.filter(b => b.growthPotential === 'GOOD').length,
        mediumPotential: growthLeads.filter(b => b.growthPotential === 'MEDIUM').length,
        avgRating: growthLeads.length > 0 ? 
          (growthLeads.reduce((sum, b) => sum + b.rating, 0) / growthLeads.length).toFixed(2) : '0.00',
        avgReviews: growthLeads.length > 0 ? 
          Math.round(growthLeads.reduce((sum, b) => sum + b.reviewCount, 0) / growthLeads.length) : 0
      },
      totalLeads: allLeads.length,
      withContactInfo: allLeads.filter(b => b.phoneNumber || b.address).length
    };

    const results = {
      searchDate: currentDate.toISOString(),
      runNumber: this.currentRun,
      location: "Multiple UK Cities",
      serviceType: "restaurant",
      searchStrategy: "Comprehensive Restaurant Reputation Management Opportunities",
      targetBusinessCount: this.targetBusinessCount,
      actualBusinessCount: allLeads.length,
      targetAchieved: allLeads.length >= this.targetBusinessCount,
      summary: summary,
      repairLeads: repairLeads.sort((a, b) => a.rating - b.rating),
      growthLeads: growthLeads.sort((a, b) => a.reviewCount - b.reviewCount),
      allLeads: allLeads
    };

    const dir = './restaurant_leads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `uk_restaurant_opportunities_${currentDate.toISOString().split('T')[0]}.json`;
    fs.writeFileSync(`${dir}/${filename}`, JSON.stringify(results, null, 2));
    
    console.log(`\n💾 RESULTS SAVED: ${dir}/${filename}`);
    return filename;
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
    } catch (error) {
      console.log('⚠️ Browser cleanup completed');
    }
  }
}

async function searchUKRestaurantOpportunities() {
  const scraper = new VisibleUKRestaurantScraper();
  
  try {
    await scraper.init();
    console.log('🚀 VISIBLE UK RESTAURANT OPPORTUNITY SCRAPER STARTED');
    console.log('👀 You can watch the browser in action!');
    console.log('🍽️ Searching UK cities for restaurant reputation management opportunities...');
    
    const allLeads = await scraper.searchMultipleUKCities({
      maxBusinesses: 50,
      citiesCount: 6
    });

    if (allLeads.length > 0) {
      const filename = await scraper.saveMultiCityResults(allLeads);
      
      const repairLeads = allLeads.filter(b => b.leadType === 'REPUTATION_REPAIR');
      const growthLeads = allLeads.filter(b => b.leadType === 'REVIEW_GROWTH');
      
      console.log(`\n🎉 COMPREHENSIVE SEARCH COMPLETE!`);
      console.log(`✅ Total opportunities found: ${allLeads.length}`);
      console.log(`📁 Saved to: ${filename}`);
      
      console.log(`\n📊 OPPORTUNITY BREAKDOWN:`);
      console.log(`🚨 Repair Opportunities: ${repairLeads.length}`);
      if (repairLeads.length > 0) {
        const critical = repairLeads.filter(b => b.urgencyLevel === 'CRITICAL');
        const high = repairLeads.filter(b => b.urgencyLevel === 'HIGH');
        console.log(`   🚨 Critical (< 2.5⭐): ${critical.length}`);
        console.log(`   ⚠️ High (2.5-2.9⭐): ${high.length}`);
        console.log(`   ⭐ Avg rating: ${(repairLeads.reduce((sum, b) => sum + b.rating, 0) / repairLeads.length).toFixed(2)}`);
      }
      
      console.log(`📈 Growth Opportunities: ${growthLeads.length}`);
      if (growthLeads.length > 0) {
        const highPotential = growthLeads.filter(b => b.growthPotential === 'HIGH');
        const goodPotential = growthLeads.filter(b => b.growthPotential === 'GOOD');
        console.log(`   🚀 High potential (≤20 reviews): ${highPotential.length}`);
        console.log(`   📈 Good potential (21-30 reviews): ${goodPotential.length}`);
        console.log(`   ⭐ Avg rating: ${(growthLeads.reduce((sum, b) => sum + b.rating, 0) / growthLeads.length).toFixed(2)}`);
        console.log(`   📊 Avg reviews: ${Math.round(growthLeads.reduce((sum, b) => sum + b.reviewCount, 0) / growthLeads.length)}`);
      }
      
      const withContact = allLeads.filter(b => b.phoneNumber || b.address);
      console.log(`📞 With contact info: ${withContact.length}`);
      
      if (repairLeads.length > 0) {
        console.log(`\n🔥 TOP REPAIR OPPORTUNITIES:`);
        repairLeads.slice(0, 5).forEach((b, i) => {
          console.log(`   ${i+1}. ${b.name} - ${b.rating}⭐ (${b.reviewCount} reviews) - ${b.urgencyLevel}`);
        });
      }
      
      if (growthLeads.length > 0) {
        console.log(`\n🚀 TOP GROWTH OPPORTUNITIES:`);
        growthLeads.slice(0, 5).forEach((b, i) => {
          console.log(`   ${i+1}. ${b.name} - ${b.rating}⭐ (${b.reviewCount} reviews) - ${b.growthPotential} POTENTIAL`);
        });
      }
      
    } else {
      console.log(`❌ No restaurant opportunities found`);
    }
    
  } catch (error) {
    console.error('❌ UK restaurant opportunity search failed:', error.message);
  } finally {
    console.log('\n⏳ Keeping browser open for 10 seconds to review results...');
    await scraper.waitFor(10000);
    await scraper.close();
  }
}

module.exports = VisibleUKRestaurantScraper;

if (require.main === module) {
  searchUKRestaurantOpportunities();
}