const puppeteer = require('puppeteer');
const fs = require('fs');

class RestaurantReputationLeadScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.foundBusinesses = new Set();
  }

  async waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-first-run',
        '--disable-extensions',
        '--window-size=1920x1080'
      ]
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    this.page.setDefaultTimeout(60000);
    this.page.setDefaultNavigationTimeout(60000);
  }

  // US CITIES WITH MIXED RESTAURANT QUALITY
  getTargetCities() {
    return {
      'US': [
        { city: 'Miami', state: 'Florida', reason: 'High competition, tourist area with mixed quality' },
        { city: 'Las Vegas', state: 'Nevada', reason: 'Tourist destination, rapid turnover' },
        { city: 'Phoenix', state: 'Arizona', reason: 'Growing city, emerging restaurant scene' },
        { city: 'Houston', state: 'Texas', reason: 'Large diverse market, mixed service levels' },
        { city: 'Atlanta', state: 'Georgia', reason: 'Competitive market, service gaps' },
        { city: 'Dallas', state: 'Texas', reason: 'High competition, diverse quality' },
        { city: 'Chicago', state: 'Illinois', reason: 'Established market with opportunities' },
        { city: 'Los Angeles', state: 'California', reason: 'Massive market, quality varies widely' },
        { city: 'Orlando', state: 'Florida', reason: 'Tourist area, seasonal quality issues' },
        { city: 'San Antonio', state: 'Texas', reason: 'Growing market, mixed establishment levels' },
        { city: 'Philadelphia', state: 'Pennsylvania', reason: 'Dense market with opportunities' },
        { city: 'Denver', state: 'Colorado', reason: 'Growing food scene, new businesses' }
      ]
    };
  }

  // RESTAURANT SEARCH STRATEGIES - TWO TYPES OF LEADS
  async searchForRestaurantLeads(city, state) {
    console.log(`🍽️ COMPREHENSIVE RESTAURANT LEAD SEARCH: ${city}`);
    
    const repairSearchTerms = [
      // LOW RATING REPAIR LEADS (2.0-3.9 stars)
      `restaurants ${city} "2 star"`,
      `restaurants ${city} "3 star"`,
      `restaurants ${city} "poor service"`,
      `restaurants ${city} "bad food"`,
      `restaurants ${city} "terrible"`,
      `restaurants ${city} "awful"`,
      `restaurants ${city} "disappointed"`,
      `restaurants ${city} "avoid"`,
      `restaurants ${city} "overpriced"`,
      `restaurants ${city} "slow service"`,
      `cheap restaurants ${city}`,
      `budget restaurants ${city}`,
      `fast food ${city} "bad"`,
      `diners ${city} "poor"`,
      `cafes ${city} "disappointing"`
    ];

    const growthSearchTerms = [
      // HIGH RATING GROWTH LEADS (4.0-5.0 stars, few reviews)
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
      `ethnic restaurants ${city}`,
      `mom and pop restaurants ${city}`,
      `cozy restaurants ${city}`,
      `intimate restaurants ${city}`
    ];

    const repairLeads = [];
    const growthLeads = [];
    
    // PHASE 1: Search for REPAIR leads (low ratings)
    console.log(`🚨 PHASE 1: Searching for REPAIR leads (low ratings)...`);
    for (const searchTerm of repairSearchTerms.slice(0, 8)) { // Limit searches
      console.log(`🔍 Repair search: ${searchTerm}`);
      
      const success = await this.searchAndExtract(searchTerm);
      if (success) {
        const newBusinesses = await this.extractRepairLeads();
        repairLeads.push(...newBusinesses);
        
        console.log(`   💀 Found ${newBusinesses.length} repair opportunities`);
        
        if (repairLeads.length >= 15) {
          console.log('🎯 Found enough repair leads, moving to growth search');
          break;
        }
      }
      await this.waitFor(2000);
    }
    
    // PHASE 2: Search for GROWTH leads (high ratings, few reviews)
    console.log(`\n📈 PHASE 2: Searching for GROWTH leads (high ratings, few reviews)...`);
    for (const searchTerm of growthSearchTerms.slice(0, 10)) { // Limit searches
      console.log(`🔍 Growth search: ${searchTerm}`);
      
      const success = await this.searchAndExtract(searchTerm);
      if (success) {
        const newBusinesses = await this.extractGrowthLeads();
        growthLeads.push(...newBusinesses);
        
        console.log(`   📈 Found ${newBusinesses.length} growth opportunities`);
        
        if (growthLeads.length >= 15) {
          console.log('🎯 Found enough growth leads, search complete');
          break;
        }
      }
      await this.waitFor(2000);
    }
    
    return {
      repairLeads: this.removeDuplicates(repairLeads),
      growthLeads: this.removeDuplicates(growthLeads)
    };
  }

  // EXTRACT REPAIR LEADS - LOW RATINGS (2.0-3.9 stars)
  async extractRepairLeads() {
    try {
      const pageReady = await this.page.evaluate(() => {
        return document.readyState === 'complete';
      }).catch(() => false);
      
      if (!pageReady) {
        console.log('⚠️ Page not ready, skipping extraction');
        return [];
      }

      const businesses = await this.page.evaluate(() => {
        const results = [];
        
        try {
          const businessSelectors = [
            '[role="article"]',
            'div[data-result-index]',
            '[jsaction*="mouseover"]',
            'div[class*="Nv2PK"]',
            'div[jsaction]',
            'a[data-cid]',
            'div[data-cid]'
          ];
          
          let allElements = [];
          businessSelectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              allElements.push(...Array.from(elements));
            } catch (e) {
              // Ignore
            }
          });
          
          allElements = [...new Set(allElements)];
          
          allElements.forEach((element) => {
            try {
              const text = element.textContent || '';
              
              // Extract rating
              let rating = null;
              const ratingPatterns = [
                /(\d+\.?\d*)\s*star/i,
                /(\d+\.?\d*)\s*⭐/,
                /Rating:\s*(\d+\.?\d*)/i,
                /(\d+\.?\d*)\s*out\s*of\s*5/i
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
              
              // Aria-label extraction
              if (!rating) {
                try {
                  const ariaElements = element.querySelectorAll('[aria-label*="star"]');
                  for (const ariaEl of ariaElements) {
                    const ariaLabel = ariaEl.getAttribute('aria-label');
                    if (ariaLabel) {
                      const ariaMatch = ariaLabel.match(/(\d+\.?\d*)\s*star/i);
                      if (ariaMatch) {
                        const parsedRating = parseFloat(ariaMatch[1]);
                        if (!isNaN(parsedRating)) {
                          rating = parsedRating;
                          break;
                        }
                      }
                    }
                  }
                } catch (e) {}
              }
              
              // Extract review count
              let reviewCount = 0;
              const reviewPatterns = [
                /\((\d+(?:,\d+)*)\s*review/i,
                /(\d+(?:,\d+)*)\s*review/i,
                /\((\d+(?:,\d+)*)\)/i
              ];
              
              for (const pattern of reviewPatterns) {
                const match = text.match(pattern);
                if (match) {
                  const parsedCount = parseInt(match[1].replace(/,/g, ''));
                  if (!isNaN(parsedCount)) {
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
                '[role="button"] span',
                'a[data-cid] span',
                '[class*="qBF1Pd"]'
              ];
              
              for (const selector of nameSelectors) {
                try {
                  const nameEl = element.querySelector(selector);
                  if (nameEl && nameEl.textContent?.trim()) {
                    businessName = nameEl.textContent.trim();
                    break;
                  }
                } catch (e) {}
              }
              
              if (!businessName) {
                const lines = text.split('\n').filter(line => line.trim().length > 0);
                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (trimmedLine.length > 3 && 
                      trimmedLine.length < 80 && 
                      !trimmedLine.match(/\d+\.?\d*\s*star/i) &&
                      !trimmedLine.match(/^\d+\s*(review|min|hour|day)/i) &&
                      !trimmedLine.match(/^(open|closed|hours|phone|website)/i)) {
                    businessName = trimmedLine;
                    break;
                  }
                }
              }
              
              // Extract cuisine type
              let cuisineType = '';
              const cuisineKeywords = {
                'Italian': /italian|pizza|pasta/i,
                'Mexican': /mexican|taco|burrito/i,
                'Chinese': /chinese|asian/i,
                'American': /american|burger|grill/i,
                'Fast Food': /fast food|quick/i,
                'Indian': /indian|curry/i,
                'Thai': /thai|pad thai/i,
                'Mediterranean': /mediterranean|greek/i
              };
              
              const businessText = text.toLowerCase();
              for (const [type, regex] of Object.entries(cuisineKeywords)) {
                if (regex.test(businessText)) {
                  cuisineType = type;
                  break;
                }
              }
              
              // Google Maps URL
              let googleMapsUrl = '';
              const linkSelectors = ['a[href*="/maps/"]', 'a[data-cid]'];
              for (const selector of linkSelectors) {
                try {
                  const linkElement = element.querySelector(selector);
                  if (linkElement) {
                    const href = linkElement.getAttribute('href');
                    const dataCid = linkElement.getAttribute('data-cid');
                    
                    if (href && href.includes('maps')) {
                      googleMapsUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
                      break;
                    } else if (dataCid) {
                      googleMapsUrl = `https://www.google.com/maps/place/?cid=${dataCid}`;
                      break;
                    }
                  }
                } catch (e) {}
              }
              
              // REPAIR LEADS: 2.0-3.9 stars with at least 3 reviews
              if (businessName && 
                  rating !== null && 
                  rating >= 2.0 && 
                  rating <= 3.9 && 
                  reviewCount >= 3 && 
                  businessName.length > 2) {
                
                let urgencyLevel = 'MEDIUM';
                if (rating < 2.5) urgencyLevel = 'CRITICAL';
                else if (rating < 3.0) urgencyLevel = 'HIGH';
                
                results.push({
                  name: businessName,
                  rating: rating,
                  reviewCount: reviewCount,
                  cuisineType: cuisineType,
                  googleMapsUrl: googleMapsUrl,
                  leadType: 'REPUTATION_REPAIR',
                  urgencyLevel: urgencyLevel,
                  extractedAt: new Date().toISOString()
                });
                
                console.log(`🚨 REPAIR LEAD: ${businessName} - ${rating}⭐ (${reviewCount} reviews) - ${urgencyLevel}`);
              }
              
            } catch (elementError) {
              // Skip problematic elements
            }
          });
          
        } catch (error) {
          console.log('Repair extraction error:', error.message);
        }
        
        return results;
      });

      return businesses || [];
      
    } catch (error) {
      console.log(`⚠️ Repair extraction failed: ${error.message}`);
      return [];
    }
  }

  // EXTRACT GROWTH LEADS - HIGH RATINGS (4.0-5.0 stars) WITH FEW REVIEWS (10-50)
  async extractGrowthLeads() {
    try {
      const pageReady = await this.page.evaluate(() => {
        return document.readyState === 'complete';
      }).catch(() => false);
      
      if (!pageReady) {
        console.log('⚠️ Page not ready, skipping extraction');
        return [];
      }

      const businesses = await this.page.evaluate(() => {
        const results = [];
        
        try {
          const businessSelectors = [
            '[role="article"]',
            'div[data-result-index]',
            '[jsaction*="mouseover"]',
            'div[class*="Nv2PK"]',
            'div[jsaction]',
            'a[data-cid]',
            'div[data-cid]'
          ];
          
          let allElements = [];
          businessSelectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              allElements.push(...Array.from(elements));
            } catch (e) {
              // Ignore
            }
          });
          
          allElements = [...new Set(allElements)];
          
          allElements.forEach((element) => {
            try {
              const text = element.textContent || '';
              
              // Extract rating
              let rating = null;
              const ratingPatterns = [
                /(\d+\.?\d*)\s*star/i,
                /(\d+\.?\d*)\s*⭐/,
                /Rating:\s*(\d+\.?\d*)/i,
                /(\d+\.?\d*)\s*out\s*of\s*5/i
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
              
              // Aria-label extraction
              if (!rating) {
                try {
                  const ariaElements = element.querySelectorAll('[aria-label*="star"]');
                  for (const ariaEl of ariaElements) {
                    const ariaLabel = ariaEl.getAttribute('aria-label');
                    if (ariaLabel) {
                      const ariaMatch = ariaLabel.match(/(\d+\.?\d*)\s*star/i);
                      if (ariaMatch) {
                        const parsedRating = parseFloat(ariaMatch[1]);
                        if (!isNaN(parsedRating)) {
                          rating = parsedRating;
                          break;
                        }
                      }
                    }
                  }
                } catch (e) {}
              }
              
              // Extract review count
              let reviewCount = 0;
              const reviewPatterns = [
                /\((\d+(?:,\d+)*)\s*review/i,
                /(\d+(?:,\d+)*)\s*review/i,
                /\((\d+(?:,\d+)*)\)/i
              ];
              
              for (const pattern of reviewPatterns) {
                const match = text.match(pattern);
                if (match) {
                  const parsedCount = parseInt(match[1].replace(/,/g, ''));
                  if (!isNaN(parsedCount)) {
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
                '[role="button"] span',
                'a[data-cid] span',
                '[class*="qBF1Pd"]'
              ];
              
              for (const selector of nameSelectors) {
                try {
                  const nameEl = element.querySelector(selector);
                  if (nameEl && nameEl.textContent?.trim()) {
                    businessName = nameEl.textContent.trim();
                    break;
                  }
                } catch (e) {}
              }
              
              if (!businessName) {
                const lines = text.split('\n').filter(line => line.trim().length > 0);
                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (trimmedLine.length > 3 && 
                      trimmedLine.length < 80 && 
                      !trimmedLine.match(/\d+\.?\d*\s*star/i) &&
                      !trimmedLine.match(/^\d+\s*(review|min|hour|day)/i) &&
                      !trimmedLine.match(/^(open|closed|hours|phone|website)/i)) {
                    businessName = trimmedLine;
                    break;
                  }
                }
              }
              
              // Extract cuisine type
              let cuisineType = '';
              const cuisineKeywords = {
                'Italian': /italian|pizza|pasta/i,
                'Mexican': /mexican|taco|burrito/i,
                'Chinese': /chinese|asian/i,
                'American': /american|burger|grill/i,
                'Fast Food': /fast food|quick/i,
                'Indian': /indian|curry/i,
                'Thai': /thai|pad thai/i,
                'Mediterranean': /mediterranean|greek/i
              };
              
              const businessText = text.toLowerCase();
              for (const [type, regex] of Object.entries(cuisineKeywords)) {
                if (regex.test(businessText)) {
                  cuisineType = type;
                  break;
                }
              }
              
              // Google Maps URL
              let googleMapsUrl = '';
              const linkSelectors = ['a[href*="/maps/"]', 'a[data-cid]'];
              for (const selector of linkSelectors) {
                try {
                  const linkElement = element.querySelector(selector);
                  if (linkElement) {
                    const href = linkElement.getAttribute('href');
                    const dataCid = linkElement.getAttribute('data-cid');
                    
                    if (href && href.includes('maps')) {
                      googleMapsUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
                      break;
                    } else if (dataCid) {
                      googleMapsUrl = `https://www.google.com/maps/place/?cid=${dataCid}`;
                      break;
                    }
                  }
                } catch (e) {}
              }
              
              // GROWTH LEADS: 4.0-5.0 stars with 10-50 reviews
              if (businessName && 
                  rating !== null && 
                  rating >= 4.0 && 
                  rating <= 5.0 && 
                  reviewCount >= 10 && 
                  reviewCount <= 50 && 
                  businessName.length > 2) {
                
                let growthPotential = 'MEDIUM';
                if (reviewCount <= 20) growthPotential = 'HIGH';
                else if (reviewCount <= 30) growthPotential = 'GOOD';
                
                results.push({
                  name: businessName,
                  rating: rating,
                  reviewCount: reviewCount,
                  cuisineType: cuisineType,
                  googleMapsUrl: googleMapsUrl,
                  leadType: 'REVIEW_GROWTH',
                  growthPotential: growthPotential,
                  extractedAt: new Date().toISOString()
                });
                
                console.log(`📈 GROWTH LEAD: ${businessName} - ${rating}⭐ (${reviewCount} reviews) - ${growthPotential} POTENTIAL`);
              }
              
            } catch (elementError) {
              // Skip problematic elements
            }
          });
          
        } catch (error) {
          console.log('Growth extraction error:', error.message);
        }
        
        return results;
      });

      return businesses || [];
      
    } catch (error) {
      console.log(`⚠️ Growth extraction failed: ${error.message}`);
      return [];
    }
  }

  async searchAndExtract(searchTerm) {
    const encodedQuery = encodeURIComponent(searchTerm);
    const url = `https://www.google.com/maps/search/${encodedQuery}`;
    
    try {
      await this.page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await this.waitFor(5000);
      return true;
    } catch (error) {
      console.log(`⚠️ Failed to load: ${searchTerm}`);
      return false;
    }
  }

  // MAIN COMPREHENSIVE RESTAURANT SEARCH
  async findRestaurantOpportunities(city, state = '', options = {}) {
    const { 
      maxRepairLeads = 15,
      maxGrowthLeads = 15
    } = options;
    
    console.log(`🍽️ COMPREHENSIVE RESTAURANT OPPORTUNITY SEARCH`);
    console.log(`📍 Location: ${city}${state ? ', ' + state : ''}`);
    console.log(`🚨 Target Repair Leads: ${maxRepairLeads} (2.0-3.9 stars)`);
    console.log(`📈 Target Growth Leads: ${maxGrowthLeads} (4.0-5.0 stars, 10-50 reviews)`);
    
    const results = await this.searchForRestaurantLeads(city, state);
    
    const repairLeads = results.repairLeads.slice(0, maxRepairLeads);
    const growthLeads = results.growthLeads.slice(0, maxGrowthLeads);
    const allLeads = [...repairLeads, ...growthLeads];
    
    console.log(`\n🎉 SEARCH COMPLETE: Found ${allLeads.length} restaurant opportunities!`);
    console.log(`🚨 Repair opportunities: ${repairLeads.length}`);
    console.log(`📈 Growth opportunities: ${growthLeads.length}`);
    
    if (allLeads.length > 0) {
      this.displayRestaurantResults(repairLeads, growthLeads);
    }
    
    return { repairLeads, growthLeads, allLeads };
  }

  displayRestaurantResults(repairLeads, growthLeads) {
    if (repairLeads.length > 0) {
      console.log(`\n🚨 REPUTATION REPAIR OPPORTUNITIES (${repairLeads.length}):`);
      
      const groupedRepair = {
        'CRITICAL (2.0-2.4★)': repairLeads.filter(r => r.rating < 2.5),
        'HIGH PRIORITY (2.5-2.9★)': repairLeads.filter(r => r.rating >= 2.5 && r.rating < 3.0),
        'MEDIUM PRIORITY (3.0-3.9★)': repairLeads.filter(r => r.rating >= 3.0)
      };
      
      Object.entries(groupedRepair).forEach(([category, businesses]) => {
        if (businesses.length > 0) {
          console.log(`\n   ${category} (${businesses.length} restaurants):`);
          businesses.forEach((restaurant, i) => {
            console.log(`   ${i+1}. ${restaurant.name} ${restaurant.cuisineType ? `[${restaurant.cuisineType}]` : ''}`);
            console.log(`      ⭐ ${restaurant.rating}/5 (${restaurant.reviewCount} reviews) - NEEDS REPUTATION HELP`);
            console.log(`      🔗 ${restaurant.googleMapsUrl || 'URL not found'}`);
          });
        }
      });
    }
    
    if (growthLeads.length > 0) {
      console.log(`\n📈 REVIEW GROWTH OPPORTUNITIES (${growthLeads.length}):`);
      
      const groupedGrowth = {
        'HIGH GROWTH (10-20 reviews)': growthLeads.filter(g => g.reviewCount <= 20),
        'GOOD GROWTH (21-30 reviews)': growthLeads.filter(g => g.reviewCount > 20 && g.reviewCount <= 30),
        'STEADY GROWTH (31-50 reviews)': growthLeads.filter(g => g.reviewCount > 30)
      };
      
      Object.entries(groupedGrowth).forEach(([category, businesses]) => {
        if (businesses.length > 0) {
          console.log(`\n   ${category} (${businesses.length} restaurants):`);
          businesses.forEach((restaurant, i) => {
            console.log(`   ${i+1}. ${restaurant.name} ${restaurant.cuisineType ? `[${restaurant.cuisineType}]` : ''}`);
            console.log(`      ⭐ ${restaurant.rating}/5 (${restaurant.reviewCount} reviews) - NEEDS MORE REVIEWS`);
            console.log(`      🔗 ${restaurant.googleMapsUrl || 'URL not found'}`);
          });
        }
      });
    }
  }

  removeDuplicates(businesses) {
    const seen = new Set();
    return businesses.filter(business => {
      const key = `${business.name.toLowerCase()}-${business.rating}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async saveResults(repairLeads, growthLeads, city, state) {
    if (!fs.existsSync('./restaurant_leads')) {
      fs.mkdirSync('./restaurant_leads', { recursive: true });
    }
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `restaurant_opportunities_${city.replace(/\s+/g, '_')}_${timestamp}.json`;
    
    const allLeads = [...repairLeads, ...growthLeads];
    
    const results = {
      searchDate: new Date().toISOString(),
      location: `${city}${state ? ', ' + state : ''}`,
      searchType: 'Restaurant Reputation Management Opportunities',
      totalLeads: allLeads.length,
      summary: {
        repairLeads: {
          count: repairLeads.length,
          critical: repairLeads.filter(r => r.rating < 2.5).length,
          high: repairLeads.filter(r => r.rating >= 2.5 && r.rating < 3.0).length,
          medium: repairLeads.filter(r => r.rating >= 3.0).length,
          avgRating: repairLeads.length > 0 ? (repairLeads.reduce((sum, r) => sum + r.rating, 0) / repairLeads.length).toFixed(2) : 0
        },
        growthLeads: {
          count: growthLeads.length,
          highPotential: growthLeads.filter(g => g.reviewCount <= 20).length,
          goodPotential: growthLeads.filter(g => g.reviewCount > 20 && g.reviewCount <= 30).length,
          steadyPotential: growthLeads.filter(g => g.reviewCount > 30).length,
          avgRating: growthLeads.length > 0 ? (growthLeads.reduce((sum, g) => sum + g.rating, 0) / growthLeads.length).toFixed(2) : 0,
          avgReviews: growthLeads.length > 0 ? Math.round(growthLeads.reduce((sum, g) => sum + g.reviewCount, 0) / growthLeads.length) : 0
        }
      },
      repairLeads: repairLeads,
      growthLeads: growthLeads,
      allLeads: allLeads
    };
    
    fs.writeFileSync(`./restaurant_leads/${filename}`, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ./restaurant_leads/${filename}`);
    
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

// TEST MAJOR US CITIES FOR RESTAURANT OPPORTUNITIES
async function testRestaurantOpportunities() {
  const scraper = new RestaurantReputationLeadScraper();
  
  const testCities = [
    { city: 'Miami', state: 'Florida', reason: 'High competition, tourist area' },
    { city: 'Phoenix', state: 'Arizona', reason: 'Growing food scene' },
    { city: 'Houston', state: 'Texas', reason: 'Large diverse market' },
    { city: 'Las Vegas', state: 'Nevada', reason: 'Tourist destination' }
  ];
  
  try {
    await scraper.init();
    console.log('🍽️ TESTING RESTAURANT OPPORTUNITIES IN MAJOR US CITIES');
    
    for (const location of testCities) {
      console.log(`\n🌟 TESTING: ${location.city}, ${location.state}`);
      console.log(`💡 Target: ${location.reason}`);
      
      const results = await scraper.findRestaurantOpportunities(
        location.city,
        location.state,
        { 
          maxRepairLeads: 12,
          maxGrowthLeads: 12
        }
      );

      if (results.allLeads.length > 0) {
        await scraper.saveResults(results.repairLeads, results.growthLeads, location.city, location.state);
        
        console.log(`✅ ${location.city} COMPLETE:`);
        console.log(`   🚨 Repair opportunities: ${results.repairLeads.length}`);
        console.log(`   📈 Growth opportunities: ${results.growthLeads.length}`);
        console.log(`   📊 Total leads: ${results.allLeads.length}`);
        
        // Highlight best opportunities
        const criticalRepair = results.repairLeads.filter(r => r.rating < 2.5);
        const highGrowth = results.growthLeads.filter(g => g.reviewCount <= 20);
        
        if (criticalRepair.length > 0) {
          console.log(`   🚨 CRITICAL repair needs: ${criticalRepair.length} restaurants under 2.5 stars`);
        }
        if (highGrowth.length > 0) {
          console.log(`   🚀 HIGH growth potential: ${highGrowth.length} restaurants with ≤20 reviews`);
        }
      } else {
        console.log(`❌ ${location.city}: No opportunities found`);
      }
      
      // Rest between cities
      await scraper.waitFor(8000);
    }
    
  } catch (error) {
    console.error('❌ Restaurant opportunity test failed:', error.message);
  } finally {
    await scraper.close();
  }
}

// SINGLE CITY TEST
async function testSingleCity() {
  const scraper = new RestaurantReputationLeadScraper();
  
  try {
    await scraper.init();
    
    const results = await scraper.findRestaurantOpportunities('Miami', 'Florida', {
      maxRepairLeads: 20,
      maxGrowthLeads: 20
    });
    
    if (results.allLeads.length > 0) {
      await scraper.saveResults(results.repairLeads, results.growthLeads, 'Miami', 'Florida');
      console.log(`\n🎉 MIAMI TEST COMPLETE: ${results.allLeads.length} total opportunities found!`);
    }
    
  } catch (error) {
    console.error('❌ Single city test failed:', error.message);
  } finally {
    await scraper.close();
  }
}

module.exports = RestaurantReputationLeadScraper;

// Run single city test by default
if (require.main === module) {
  testSingleCity();
}