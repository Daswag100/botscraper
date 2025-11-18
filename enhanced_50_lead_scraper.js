const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class Enhanced50LeadScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.foundBusinesses = new Set();
    this.historicalLeads = new Set();
    this.targetBusinessCount = 50; // Enhanced target: 50 businesses
    this.maxSearches = 8; // Increased search variations
    this.currentRun = 0;
  }

  async waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    console.log('🚀 Initializing Enhanced 50-Lead Scraper...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    this.page = await this.browser.newPage();
    
    await this.page.setViewport({ width: 1920, height: 1080 });
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

  // Enhanced search terms generator for better coverage
  generateSearchTerms(businessType, city) {
    const baseTerms = {
      'restaurant': [
        `${businessType} ${city}`,
        `${businessType}s ${city}`,
        `cheap ${businessType} ${city}`,
        `bad ${businessType} ${city}`,
        `worst ${businessType} ${city}`,
        `poor service ${businessType} ${city}`,
        `low rated ${businessType} ${city}`,
        `1 star ${businessType} ${city}`,
        `2 star ${businessType} ${city}`,
        `takeaway ${city}`,
        `fast food ${city}`,
        `budget dining ${city}`,
        `local eateries ${city}`,
        `family restaurant ${city}`,
        `chinese restaurant ${city}`,
        `indian restaurant ${city}`,
        `pizza ${city}`,
        `fish and chips ${city}`,
        `kebab ${city}`,
        `curry house ${city}`
      ],
      'takeaway': [
        `takeaway ${city}`,
        `takeout ${city}`,
        `delivery food ${city}`,
        `cheap takeaway ${city}`,
        `local takeaway ${city}`,
        `fast food delivery ${city}`,
        `pizza delivery ${city}`,
        `chinese takeaway ${city}`,
        `indian takeaway ${city}`,
        `burger takeaway ${city}`,
        `fried chicken ${city}`,
        `kebab takeaway ${city}`
      ],
      'cafe': [
        `cafe ${city}`,
        `coffee shop ${city}`,
        `local cafe ${city}`,
        `breakfast cafe ${city}`,
        `sandwich shop ${city}`,
        `tea room ${city}`,
        `bistro ${city}`,
        `coffee house ${city}`
      ]
    };

    // Get base terms or default to restaurant terms
    const terms = baseTerms[businessType.toLowerCase()] || baseTerms['restaurant'];
    
    // Add generic terms that work for any business type
    const genericTerms = [
      `${businessType} near ${city}`,
      `${businessType} in ${city}`,
      `local ${businessType} ${city}`,
      `cheap ${businessType} ${city}`,
      `best ${businessType} ${city}`,
      `worst ${businessType} ${city}`
    ];

    return [...terms, ...genericTerms];
  }

  // Enhanced business extraction with better rating filtering
  async extractBusinessesFromPage(minStars = 1.0, maxStars = 3.5, maxBusinesses = 50) {
    console.log(`🔍 Extracting businesses with ratings ${minStars}-${maxStars} stars...`);
    
    return await this.page.evaluate((minStars, maxStars, maxBusinesses) => {
      const businesses = [];
      const businessElements = document.querySelectorAll('[data-result-index], [class*="Nv2PK"], [class*="VkpGBb"], .g, [class*="VkpGBb"]');
      
      console.log(`Found ${businessElements.length} potential business elements`);

      for (let i = 0; i < businessElements.length && businesses.length < maxBusinesses; i++) {
        const element = businessElements[i];
        const text = element.textContent || '';
        
        // Extract rating with multiple methods
        let rating = null;
        
        // Method 1: Direct rating patterns
        const ratingPatterns = [
          /(\d+\.?\d*)\s*star/i,
          /(\d+\.?\d*)\s*out\s*of\s*5/i,
          /(\d+\.?\d*)\s*\/\s*5/i,
          /Rating:\s*(\d+\.?\d*)/i,
          /(\d+\.?\d*)\s*★/i,
          /★\s*(\d+\.?\d*)/i
        ];
        
        for (const pattern of ratingPatterns) {
          const match = text.match(pattern);
          if (match) {
            const parsedRating = parseFloat(match[1]);
            if (!isNaN(parsedRating) && parsedRating >= 0 && parsedRating <= 5) {
              rating = parsedRating;
              break;
            }
          }
        }
        
        // Method 2: Aria-label extraction
        if (!rating) {
          const ariaElements = element.querySelectorAll('[aria-label*="star"], [aria-label*="rating"], [aria-label*="rated"]');
          for (const ariaEl of ariaElements) {
            const ariaLabel = ariaEl.getAttribute('aria-label') || '';
            const ariaMatch = ariaLabel.match(/(\d+\.?\d*)\s*(star|rating)/i);
            if (ariaMatch) {
              const parsedRating = parseFloat(ariaMatch[1]);
              if (!isNaN(parsedRating) && parsedRating >= 0 && parsedRating <= 5) {
                rating = parsedRating;
                break;
              }
            }
          }
        }

        // Skip if no rating found or rating is outside our target range
        if (rating === null || rating < minStars || rating > maxStars) {
          continue;
        }

        // Extract review count
        let reviewCount = 0;
        const reviewPatterns = [
          /\((\d+(?:,\d+)*)\s*review/i,
          /(\d+(?:,\d+)*)\s*review/i,
          /\((\d+(?:,\d+)*)\)/i,
          /(\d+(?:,\d+)*)\s*Google\s*review/i,
          /based\s*on\s*(\d+(?:,\d+)*)/i
        ];
        
        for (const pattern of reviewPatterns) {
          const match = text.match(pattern);
          if (match) {
            const parsedCount = parseInt(match[1].replace(/,/g, ''));
            if (!isNaN(parsedCount) && parsedCount > 0) {
              reviewCount = parsedCount;
              break;
            }
          }
        }

        // Extract business name
        let businessName = '';
        const nameSelectors = [
          '[class*="fontHeadlineSmall"]',
          'h3',
          '[role="button"] span:first-child',
          'a[data-cid] span:first-child',
          '[class*="qBF1Pd"]',
          '.fontHeadlineSmall',
          '[class*="NrDZNb"]'
        ];
        
        for (const selector of nameSelectors) {
          const nameEl = element.querySelector(selector);
          if (nameEl && nameEl.textContent?.trim()) {
            const name = nameEl.textContent.trim();
            if (name.length > 2 && name.length < 100) {
              businessName = name;
              break;
            }
          }
        }
        
        // Fallback name extraction
        if (!businessName) {
          const lines = text.split('\n').filter(line => line.trim().length > 0);
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.length > 3 && 
                trimmedLine.length < 80 && 
                !trimmedLine.match(/\d+\.?\d*\s*star/i) &&
                !trimmedLine.match(/^\d+\s*(review|min|hour|day|km|mile)/i) &&
                !trimmedLine.match(/^(open|closed|hours|phone|website|directions)/i) &&
                !trimmedLine.match(/^[\d\s\-\(\)]+$/)) {
              businessName = trimmedLine;
              break;
            }
          }
        }

        // Skip if no valid business name
        if (!businessName || businessName.length < 3) {
          continue;
        }

        // Extract Google Maps URL
        let googleMapsUrl = '';
        const linkSelectors = [
          'a[href*="/maps/place/"]',
          'a[data-cid]',
          'a[href*="ludocid"]',
          'a[href*="/place/"]'
        ];
        
        for (const selector of linkSelectors) {
          const linkElement = element.querySelector(selector);
          if (linkElement) {
            const href = linkElement.getAttribute('href');
            const dataCid = linkElement.getAttribute('data-cid');
            
            if (href && (href.includes('maps') || href.includes('place'))) {
              googleMapsUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
              break;
            } else if (dataCid) {
              googleMapsUrl = `https://www.google.com/maps/place/?cid=${dataCid}`;
              break;
            }
          }
        }

        // Extract additional details
        let address = '';
        let phoneNumber = '';
        let businessType = '';
        
        // Address extraction
        const addressPatterns = [
          /([A-Za-z0-9\s,'-]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Close|Cl|Court|Ct|Square|Sq|Crescent|Cres)[A-Za-z0-9\s,'-]*)/i,
          /([A-Za-z0-9\s,'-]+(?:Birmingham|Manchester|Liverpool|Leeds|Bristol|Newcastle|Sheffield|Cardiff|Glasgow|Edinburgh)[A-Za-z0-9\s,'-]*)/i
        ];
        
        for (const pattern of addressPatterns) {
          const addressMatch = text.match(pattern);
          if (addressMatch) {
            address = addressMatch[1].trim();
            break;
          }
        }
        
        // UK phone number extraction
        const ukPhonePatterns = [
          /(\+44\s?\d{2,4}\s?\d{3,4}\s?\d{3,4})/,
          /(0\d{2,4}\s?\d{3,4}\s?\d{3,4})/
        ];
        
        for (const pattern of ukPhonePatterns) {
          const phoneMatch = text.match(pattern);
          if (phoneMatch) {
            phoneNumber = phoneMatch[1];
            break;
          }
        }
        
        // Business type extraction
        const typePatterns = [
          /·\s*([A-Za-z\s]+)\s*·/,
          /(Restaurant|Takeaway|Cafe|Shop|Store|Salon|Garage|Hotel)/i
        ];
        
        for (const pattern of typePatterns) {
          const typeMatch = text.match(pattern);
          if (typeMatch) {
            businessType = typeMatch[1].trim();
            break;
          }
        }

        // Determine opportunity level based on rating
        let opportunityLevel = 'MILD';
        let urgency = 'MODERATE';
        let potentialValue = 'MILD';
        
        if (rating <= 2.5) {
          opportunityLevel = 'CRITICAL';
          urgency = 'IMMEDIATE';
          potentialValue = 'VERY HIGH';
        } else if (rating <= 3.0) {
          opportunityLevel = 'HIGH';
          urgency = 'HIGH';
          potentialValue = 'HIGH';
        } else if (rating <= 3.5) {
          opportunityLevel = 'MODERATE';
          urgency = 'HIGH';
          potentialValue = 'MODERATE';
        }

        const business = {
          name: businessName,
          rating: rating,
          reviewCount: reviewCount,
          googleMapsUrl: googleMapsUrl,
          address: address,
          phoneNumber: phoneNumber,
          businessType: businessType,
          opportunityLevel: opportunityLevel,
          urgency: urgency,
          potentialValue: potentialValue,
          isLowRating: rating <= 3.5,
          extractedAt: new Date().toISOString(),
          isNewLead: true
        };

        businesses.push(business);
      }

      console.log(`Extracted ${businesses.length} businesses in target rating range`);
      return businesses;
    }, minStars, maxStars, maxBusinesses);
  }

  // Enhanced search with multiple strategies to find 50+ businesses
  async findUpTo50LowRatedBusinesses(businessType, city, state, options = {}) {
    const {
      minReviews = 1,
      maxBusinesses = 50,
      minStars = 1.0,
      maxStars = 3.5,
      maxReviews = 500
    } = options;

    console.log(`\n🎯 ENHANCED SEARCH: Looking for up to ${maxBusinesses} low-rated ${businessType} businesses in ${city}, ${state}`);
    console.log(`⭐ Target rating range: ${minStars} - ${maxStars} stars`);
    
    const allBusinesses = [];
    const foundNames = new Set();
    const searchTerms = this.generateSearchTerms(businessType, city);
    
    // Shuffle search terms for variety
    const shuffledTerms = searchTerms.sort(() => Math.random() - 0.5);
    
    let searchCount = 0;
    const maxSearchIterations = Math.min(this.maxSearches, shuffledTerms.length);
    
    for (const searchTerm of shuffledTerms.slice(0, maxSearchIterations)) {
      if (allBusinesses.length >= maxBusinesses) {
        console.log(`✅ Target reached: Found ${allBusinesses.length} businesses (target: ${maxBusinesses})`);
        break;
      }
      
      searchCount++;
      console.log(`\n🔍 Search ${searchCount}/${maxSearchIterations}: "${searchTerm}"`);
      
      try {
        // Navigate to Google search
        const searchUrl = `https://www.google.co.uk/search?q=${encodeURIComponent(searchTerm)}&tbm=lcl`;
        console.log(`🌐 Searching: ${searchUrl}`);
        
        await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
        await this.waitFor(3000);

        // Handle cookie consent if needed
        try {
          const consentButton = await this.page.$('#L2AGLb');
          if (consentButton) {
            await consentButton.click();
            await this.waitFor(2000);
          }
        } catch (e) {}

        // Extract businesses from this search
        const businesses = await this.extractBusinessesFromPage(minStars, maxStars, maxBusinesses);
        
        // Filter out duplicates and add new businesses
        let newBusinessesAdded = 0;
        for (const business of businesses) {
          const nameKey = business.name.toLowerCase().trim();
          
          // Skip if we already have this business
          if (foundNames.has(nameKey)) {
            continue;
          }
          
          // Apply filters
          if (business.reviewCount < minReviews || business.reviewCount > maxReviews) {
            continue;
          }
          
          foundNames.add(nameKey);
          allBusinesses.push(business);
          newBusinessesAdded++;
          
          if (allBusinesses.length >= maxBusinesses) {
            break;
          }
        }
        
        console.log(`   📊 Found ${businesses.length} results, added ${newBusinessesAdded} new businesses`);
        console.log(`   📈 Total unique businesses: ${allBusinesses.length}/${maxBusinesses}`);
        
        // Add delay between searches
        await this.waitFor(2000 + Math.random() * 3000);
        
      } catch (error) {
        console.log(`   ❌ Search failed: ${error.message}`);
        await this.waitFor(5000); // Longer delay on error
      }
    }
    
    console.log(`\n🎉 SEARCH COMPLETE: Found ${allBusinesses.length} low-rated businesses`);
    
    // Sort by opportunity level (critical first)
    allBusinesses.sort((a, b) => {
      const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MODERATE': 2, 'MILD': 3 };
      return priorityOrder[a.opportunityLevel] - priorityOrder[b.opportunityLevel];
    });
    
    return allBusinesses;
  }

  // Save results with enhanced summary
  async saveEnhancedResults(businesses, businessType, city, state) {
    const currentDate = new Date();
    this.currentRun++;
    
    const summary = {
      critical: businesses.filter(b => b.opportunityLevel === 'CRITICAL').length,
      high: businesses.filter(b => b.opportunityLevel === 'HIGH').length,
      moderate: businesses.filter(b => b.opportunityLevel === 'MODERATE').length,
      mild: businesses.filter(b => b.opportunityLevel === 'MILD').length,
      averageRating: businesses.length > 0 ? 
        (businesses.reduce((sum, b) => sum + b.rating, 0) / businesses.length).toFixed(2) : '0.00',
      averageReviews: businesses.length > 0 ? 
        Math.round(businesses.reduce((sum, b) => sum + b.reviewCount, 0) / businesses.length) : 0,
      withContactInfo: businesses.filter(b => b.phoneNumber || b.address).length,
      below3Stars: businesses.filter(b => b.rating < 3.0).length,
      below2_5Stars: businesses.filter(b => b.rating < 2.5).length
    };

    const results = {
      searchDate: currentDate.toISOString(),
      runNumber: this.currentRun,
      location: `${city}, ${state}`,
      serviceType: businessType,
      searchStrategy: "Enhanced 50-Business Multi-Strategy Search",
      targetBusinessCount: this.targetBusinessCount,
      actualBusinessCount: businesses.length,
      targetAchieved: businesses.length >= this.targetBusinessCount,
      duplicatesFiltered: 0,
      totalNewBusinessesFound: businesses.length,
      summary: summary,
      businesses: businesses
    };

    // Ensure directory exists
    const dir = './optimized_leads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `enhanced_50_leads_${businessType}_${city}_${currentDate.toISOString().split('T')[0]}.json`;
    fs.writeFileSync(`${dir}/${filename}`, JSON.stringify(results, null, 2));
    
    console.log(`\n💾 ENHANCED RESULTS saved to: ${dir}/${filename}`);
    console.log(`\n📊 SUMMARY:`);
    console.log(`   🎯 Target: ${this.targetBusinessCount} businesses`);
    console.log(`   ✅ Found: ${businesses.length} businesses`);
    console.log(`   🏆 Success Rate: ${((businesses.length / this.targetBusinessCount) * 100).toFixed(1)}%`);
    console.log(`   🚨 Critical Opportunities: ${summary.critical}`);
    console.log(`   ⚠️  High Opportunities: ${summary.high}`);
    console.log(`   📞 With Contact Info: ${summary.withContactInfo}`);
    console.log(`   ⭐ Below 3.0 stars: ${summary.below3Stars}`);
    console.log(`   💥 Below 2.5 stars: ${summary.below2_5Stars}`);
    
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

// Test function to find 50 low-rated restaurant businesses
async function find50LowRatedRestaurants() {
  const scraper = new Enhanced50LeadScraper();
  
  try {
    await scraper.init();
    console.log('🚀 ENHANCED 50-LEAD SCRAPER: Finding low-rated restaurants');
    console.log('🎯 Target: 50 businesses with 1.0-3.5 star ratings');
    
    const businesses = await scraper.findUpTo50LowRatedBusinesses(
      'restaurant',
      'Manchester', // Change city as needed
      'England',
      {
        minReviews: 5,        // At least 5 reviews
        maxBusinesses: 50,    // Target 50 businesses
        minStars: 1.0,        // Very low rated
        maxStars: 3.5,        // Up to 3.5 stars
        maxReviews: 400       // Not too established
      }
    );

    if (businesses.length > 0) {
      await scraper.saveEnhancedResults(businesses, 'restaurant', 'Manchester', 'England');
      
      const criticalBusinesses = businesses.filter(b => b.opportunityLevel === 'CRITICAL');
      const highBusinesses = businesses.filter(b => b.opportunityLevel === 'HIGH');
      
      console.log(`\n🎉 SUCCESS: Enhanced scraper found ${businesses.length} low-rated restaurants!`);
      
      if (businesses.length >= 50) {
        console.log(`✅ TARGET ACHIEVED: Found ${businesses.length} businesses (50+ target met)`);
      } else {
        console.log(`⚠️ Partial success: Found ${businesses.length} businesses (target was 50)`);
      }
      
      if (criticalBusinesses.length > 0) {
        console.log(`\n🚨 CRITICAL OPPORTUNITIES (${criticalBusinesses.length}):`);
        criticalBusinesses.slice(0, 5).forEach(b => {
          console.log(`   💥 ${b.name} - ${b.rating}⭐ (${b.reviewCount} reviews)`);
        });
      }
      
      if (highBusinesses.length > 0) {
        console.log(`\n⚠️ HIGH OPPORTUNITIES (${highBusinesses.length}):`);
        highBusinesses.slice(0, 5).forEach(b => {
          console.log(`   🔥 ${b.name} - ${b.rating}⭐ (${b.reviewCount} reviews)`);
        });
      }
      
    } else {
      console.log(`❌ No low-rated restaurants found this run`);
    }
    
  } catch (error) {
    console.error('❌ Enhanced 50-lead search failed:', error.message);
  } finally {
    await scraper.close();
  }
}

// Export for use in other files
module.exports = Enhanced50LeadScraper;

// Run the test if this file is executed directly
if (require.main === module) {
  find50LowRatedRestaurants();
}

