const puppeteer = require('puppeteer');
const fs = require('fs');

class ServiceBusinessLeadScraper {
  constructor() {
    this.browser = null;
    this.page = null;
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
    
    await this.page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await this.page.waitForTimeout(3000);
    
    // Wait for business listings to load
    await this.page.waitForSelector('[role="main"]', { timeout: 10000 });
    console.log('✅ Search results loaded');
  }

  async extractBusinessInfo(businessElement) {
    return await this.page.evaluate((element) => {
      try {
        // Extract business name
        const nameElement = element.querySelector('[class*="fontHeadlineSmall"]') ||
                           element.querySelector('h3') ||
                           element.querySelector('[role="button"] div[class*="fontBodyMedium"]');
        const businessName = nameElement?.textContent?.trim() || 'Unknown Business';

        // Extract rating
        let rating = null;
        const ratingElement = element.querySelector('[role="img"][aria-label*="star"]');
        if (ratingElement) {
          const ariaLabel = ratingElement.getAttribute('aria-label');
          const ratingMatch = ariaLabel.match(/(\d+\.?\d*)\s*star/i);
          if (ratingMatch) rating = parseFloat(ratingMatch[1]);
        }

        // Extract review count
        let reviewCount = 0;
        const reviewElement = element.querySelector('[aria-label*="review"]');
        if (reviewElement) {
          const reviewText = reviewElement.textContent;
          const countMatch = reviewText.match(/(\d+(?:,\d+)*)/);
          if (countMatch) reviewCount = parseInt(countMatch[1].replace(/,/g, ''));
        }

        // Extract address
        const addressElements = element.querySelectorAll('div[style*="color: rgb(95, 99, 104)"]');
        let address = '';
        for (const addrEl of addressElements) {
          const text = addrEl.textContent.trim();
          if (text.includes(',') || text.match(/\d+.*?(street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd)/i)) {
            address = text;
            break;
          }
        }

        // Extract phone number
        let phone = '';
        const phoneElement = element.querySelector('[data-value*="+"]') ||
                           element.querySelector('[href^="tel:"]');
        if (phoneElement) {
          phone = phoneElement.getAttribute('data-value') || 
                 phoneElement.getAttribute('href')?.replace('tel:', '') || 
                 phoneElement.textContent;
        }

        // Extract website
        let website = '';
        const websiteElement = element.querySelector('[data-value^="http"]') ||
                             element.querySelector('[href^="http"]:not([href*="google"])');
        if (websiteElement) {
          website = websiteElement.getAttribute('data-value') || 
                   websiteElement.getAttribute('href');
        }

        return {
          name: businessName,
          rating: rating,
          reviewCount: reviewCount,
          address: address,
          phone: phone,
          website: website,
          element: element // Keep reference for clicking
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
    
    const businesses = [];
    let scrollAttempts = 0;
    const maxScrolls = Math.ceil(maxBusinesses / 20); // Roughly 20 businesses per scroll
    
    while (businesses.length < maxBusinesses && scrollAttempts < maxScrolls) {
      // Get current business elements
      const businessElements = await this.page.$$('[role="article"], div[data-result-index]');
      
      for (const element of businessElements) {
        if (businesses.length >= maxBusinesses) break;
        
        const businessInfo = await this.extractBusinessInfo(element);
        
        if (businessInfo && 
            businessInfo.rating && 
            businessInfo.rating >= 2 && 
            businessInfo.rating <= 3.9 &&
            businessInfo.reviewCount >= minReviews) {
          
          // Check if already added
          const isDuplicate = businesses.some(b => 
            b.name === businessInfo.name && b.address === businessInfo.address
          );
          
          if (!isDuplicate) {
            businesses.push({
              ...businessInfo,
              serviceType: serviceType,
              searchLocation: `${city}${state ? ', ' + state : ''}`,
              extractedAt: new Date().toISOString()
            });
            
            console.log(`✅ Found: ${businessInfo.name} (${businessInfo.rating}⭐, ${businessInfo.reviewCount} reviews)`);
          }
        }
      }
      
      // Scroll to load more businesses
      await this.page.evaluate(() => {
        const resultsContainer = document.querySelector('[role="main"]');
        if (resultsContainer) {
          resultsContainer.scrollTop += 1000;
        } else {
          window.scrollBy(0, 1000);
        }
      });
      
      await this.page.waitForTimeout(2000);
      scrollAttempts++;
    }
    
    console.log(`📊 Found ${businesses.length} businesses with 2-3.9 star ratings`);
    return businesses;
  }

  async scrapeLowRatedReviewsForBusiness(businessData, maxReviews = 20) {
    console.log(`📝 Getting reviews for: ${businessData.name}`);
    
    try {
      // Click on the business to open details
      const businessElements = await this.page.$$('[role="article"], div[data-result-index]');
      
      for (const element of businessElements) {
        const name = await this.page.evaluate(el => {
          const nameEl = el.querySelector('[class*="fontHeadlineSmall"]') || el.querySelector('h3');
          return nameEl?.textContent?.trim();
        }, element);
        
        if (name && name.includes(businessData.name.substring(0, 20))) {
          await element.click();
          await this.page.waitForTimeout(3000);
          break;
        }
      }
      
      // Navigate to reviews
      await this.navigateToReviews();
      
      // Load reviews
      await this.loadReviews(Math.ceil(maxReviews / 10));
      
      // Extract reviews
      const reviews = await this.extractFilteredReviews(2, 3.9);
      
      return reviews.slice(0, maxReviews);
      
    } catch (error) {
      console.log(`❌ Could not get reviews for ${businessData.name}: ${error.message}`);
      return [];
    }
  }

  async navigateToReviews() {
    try {
      const reviewsSelectors = [
        'button[data-value="Sort"]',
        '[data-tab-index="1"]',
        'button[role="tab"]:nth-child(2)',
        '[aria-label*="review" i]'
      ];
      
      for (const selector of reviewsSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            await this.page.waitForTimeout(2000);
            return;
          }
        } catch (e) {
          continue;
        }
      }
    } catch (error) {
      console.log('Reviews navigation failed, continuing...');
    }
  }

  async loadReviews(scrolls = 5) {
    for (let i = 0; i < scrolls; i++) {
      await this.page.evaluate(() => {
        const container = document.querySelector('[data-reviewid]')?.closest('[style*="overflow"]') ||
                         document.querySelector('div[role="main"]');
        if (container) {
          container.scrollTop += 800;
        } else {
          window.scrollBy(0, 800);
        }
      });
      await this.page.waitForTimeout(1500);
    }
  }

  async extractFilteredReviews(minStars = 2, maxStars = 3.9) {
    return await this.page.evaluate((minStars, maxStars) => {
      const reviewElements = document.querySelectorAll('[data-reviewid], div[data-review-id]');
      const reviews = [];
      
      reviewElements.forEach(reviewEl => {
        try {
          // Extract star rating
          const starElement = reviewEl.querySelector('[aria-label*="star" i]');
          let stars = null;
          
          if (starElement) {
            const ariaLabel = starElement.getAttribute('aria-label');
            const match = ariaLabel.match(/(\d+(?:\.\d+)?)\s*star/i);
            if (match) stars = parseFloat(match[1]);
          }
          
          if (stars && stars >= minStars && stars <= maxStars) {
            // Extract review text
            const textElement = reviewEl.querySelector('[data-expandable-section]') ||
                               reviewEl.querySelector('span[jsaction*="expand"]') ||
                               reviewEl.querySelector('span[dir="ltr"]');
            
            const reviewText = textElement?.textContent?.trim() || '';
            
            // Extract author
            const authorElement = reviewEl.querySelector('button[data-href*="contrib"] span') ||
                                 reviewEl.querySelector('[class*="author"] span');
            const authorName = authorElement?.textContent?.trim() || 'Anonymous';
            
            // Extract date
            const dateElement = reviewEl.querySelector('[class*="date"], [style*="color: rgb(95, 99, 104)"]');
            const reviewDate = dateElement?.textContent?.trim() || '';
            
            if (reviewText.length > 10) {
              reviews.push({
                author: authorName,
                rating: stars,
                text: reviewText,
                date: reviewDate
              });
            }
          }
        } catch (error) {
          console.log('Error processing review:', error);
        }
      });
      
      return reviews;
    }, minStars, maxStars);
  }

  // Main method to scrape service businesses for lead generation
  async scrapeServiceLeads(serviceTypes, locations, options = {}) {
    const {
      minReviews = 5,
      maxBusinessesPerSearch = 30,
      includeReviews = true,
      maxReviewsPerBusiness = 10,
      outputDir = './leads'
    } = options;

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const allLeads = [];

    try {
      await this.init();

      for (const serviceType of serviceTypes) {
        console.log(`\n🎯 Searching for ${serviceType} businesses...`);
        
        for (const location of locations) {
          console.log(`\n📍 Location: ${location.city}, ${location.state || ''}`);
          
          try {
            // Get businesses in this location
            const businesses = await this.getBusinessesInArea(
              serviceType, 
              location.city, 
              location.state,
              { 
                minReviews: minReviews,
                maxBusinesses: maxBusinessesPerSearch 
              }
            );

            // Add reviews if requested
            if (includeReviews) {
              for (const business of businesses) {
                console.log(`📝 Getting reviews for: ${business.name}`);
                const reviews = await this.scrapeLowRatedReviewsForBusiness(business, maxReviewsPerBusiness);
                business.lowRatedReviews = reviews;
                business.reviewSummary = {
                  totalLowRatedReviews: reviews.length,
                  averageRating: business.rating,
                  commonComplaints: this.extractCommonComplaints(reviews)
                };
                
                // Go back to search results
                await this.page.goBack();
                await this.page.waitForTimeout(2000);
              }
            }

            allLeads.push(...businesses);

            // Save results for this service/location combination
            const filename = `${serviceType.replace(/\s+/g, '_')}_${location.city.replace(/\s+/g, '_')}_leads.json`;
            const filepath = `${outputDir}/${filename}`;
            
            const locationResults = {
              serviceType: serviceType,
              location: location,
              searchDate: new Date().toISOString(),
              totalBusinesses: businesses.length,
              businesses: businesses
            };

            fs.writeFileSync(filepath, JSON.stringify(locationResults, null, 2));
            console.log(`💾 Saved ${businesses.length} leads to ${filepath}`);

          } catch (error) {
            console.error(`❌ Error searching ${serviceType} in ${location.city}:`, error.message);
          }

          // Delay between searches to avoid rate limiting
          await this.page.waitForTimeout(3000);
        }
      }

      // Save consolidated results
      const consolidatedResults = {
        searchDate: new Date().toISOString(),
        totalLeads: allLeads.length,
        serviceTypes: serviceTypes,
        locations: locations,
        summary: this.generateLeadSummary(allLeads),
        leads: allLeads
      };

      const consolidatedPath = `${outputDir}/all_service_leads.json`;
      fs.writeFileSync(consolidatedPath, JSON.stringify(consolidatedResults, null, 2));
      
      console.log(`\n🎉 COMPLETE! Found ${allLeads.length} total leads`);
      console.log(`📊 Results saved to ${consolidatedPath}`);

      return consolidatedResults;

    } catch (error) {
      console.error('❌ Scraping failed:', error);
      throw error;
    } finally {
      await this.close();
    }
  }

  extractCommonComplaints(reviews) {
    const complaintsKeywords = [
      'late', 'delayed', 'unprofessional', 'rude', 'expensive', 'overpriced',
      'poor quality', 'bad service', 'unreliable', 'messy', 'incomplete',
      'communication', 'follow up', 'warranty', 'guarantee'
    ];

    const complaints = [];
    reviews.forEach(review => {
      const text = review.text.toLowerCase();
      complaintsKeywords.forEach(keyword => {
        if (text.includes(keyword)) {
          complaints.push(keyword);
        }
      });
    });

    // Count frequency and return top complaints
    const complaintCounts = {};
    complaints.forEach(complaint => {
      complaintCounts[complaint] = (complaintCounts[complaint] || 0) + 1;
    });

    return Object.entries(complaintCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([complaint, count]) => ({ complaint, mentions: count }));
  }

  generateLeadSummary(leads) {
    const byService = {};
    const byLocation = {};
    let totalReviews = 0;

    leads.forEach(lead => {
      // Group by service type
      if (!byService[lead.serviceType]) {
        byService[lead.serviceType] = 0;
      }
      byService[lead.serviceType]++;

      // Group by location
      const locationKey = lead.searchLocation;
      if (!byLocation[locationKey]) {
        byLocation[locationKey] = 0;
      }
      byLocation[locationKey]++;

      // Count reviews
      if (lead.lowRatedReviews) {
        totalReviews += lead.lowRatedReviews.length;
      }
    });

    return {
      totalLeads: leads.length,
      totalReviews: totalReviews,
      averageRating: (leads.reduce((sum, lead) => sum + (lead.rating || 0), 0) / leads.length).toFixed(1),
      byServiceType: byService,
      byLocation: byLocation,
      ratingDistribution: {
        '2.0-2.5': leads.filter(l => l.rating >= 2.0 && l.rating < 2.5).length,
        '2.5-3.0': leads.filter(l => l.rating >= 2.5 && l.rating < 3.0).length,
        '3.0-3.5': leads.filter(l => l.rating >= 3.0 && l.rating < 3.5).length,
        '3.5-3.9': leads.filter(l => l.rating >= 3.5 && l.rating <= 3.9).length
      }
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Usage for your specific service business lead generation
async function generateServiceLeads() {
  const scraper = new ServiceBusinessLeadScraper();

  // Define your target service types
  const serviceTypes = [
    'roofing contractors',
    'solar installation companies', 
    'plumbers',
    'chiropractors',
    'construction companies',
    'electricians',
    'dentists'
  ];

  // Define your target locations
  const locations = [
    { city: 'Los Angeles', state: 'California' },
    { city: 'Miami', state: 'Florida' },
    { city: 'Houston', state: 'Texas' },
    { city: 'Phoenix', state: 'Arizona' },
    { city: 'Atlanta', state: 'Georgia' }
    // Add more locations as needed
  ];

  try {
    const results = await scraper.scrapeServiceLeads(serviceTypes, locations, {
      minReviews: 5,              // Only businesses with at least 5 reviews
      maxBusinessesPerSearch: 25, // Max businesses per service/location
      includeReviews: true,       // Get actual review text for outreach
      maxReviewsPerBusiness: 15,  // Max reviews per business
      outputDir: './service_leads' // Where to save results
    });

    console.log('\n📈 LEAD GENERATION SUMMARY:');
    console.log(`📋 Total Leads: ${results.totalLeads}`);
    console.log(`⭐ Average Rating: ${results.summary.averageRating} stars`);
    console.log(`📝 Total Reviews: ${results.summary.totalReviews}`);
    
    console.log('\n📊 By Service Type:');
    Object.entries(results.summary.byServiceType).forEach(([service, count]) => {
      console.log(`   ${service}: ${count} businesses`);
    });

    console.log('\n🎯 These businesses need your help improving their reputation!');

  } catch (error) {
    console.error('❌ Lead generation failed:', error);
  }
}

// Quick single service test
async function testSingleService() {
  const scraper = new ServiceBusinessLeadScraper();
  
  try {
    await scraper.init();
    
    const businesses = await scraper.getBusinessesInArea(
      'roofing contractors',  // Change this to test different services
      'Dallas',              // Change city
      'Texas',               // Change state
      { 
        minReviews: 3,
        maxBusinesses: 10 
      }
    );

    console.log(`\n✅ Found ${businesses.length} roofing contractors with 2-3.9 star ratings:`);
    
    businesses.forEach((business, i) => {
      console.log(`\n${i+1}. ${business.name}`);
      console.log(`   ⭐ Rating: ${business.rating} (${business.reviewCount} reviews)`);
      console.log(`   📍 Address: ${business.address}`);
      console.log(`   📞 Phone: ${business.phone}`);
      console.log(`   🌐 Website: ${business.website || 'No website listed'}`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await scraper.close();
  }
}

// Export for use
module.exports = ServiceBusinessLeadScraper;

// Run the lead generator
if (require.main === module) {
  // For testing a single service type:
  testSingleService();
  
  // For full lead generation across all services:
  // generateServiceLeads();
}