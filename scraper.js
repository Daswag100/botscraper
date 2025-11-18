const puppeteer = require('puppeteer');
const fs = require('fs');

class ServiceBusinessLeadScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  // Helper function to wait - works with all Puppeteer versions
  async waitFor(ms) {
    await this.page.evaluate((ms) => {
      return new Promise(resolve => setTimeout(resolve, ms));
    }, ms);
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

  // NEW ENHANCED METHOD FOR 1-4.1 STAR RANGE
  async getBusinessesInAreaExpanded(serviceType, city, state = '', options = {}) {
    const { 
      minReviews = 3, 
      maxBusinesses = 15,
      minStars = 1.0,
      maxStars = 4.1
    } = options;
    
    await this.searchServiceInArea(serviceType, city, state);
    
    console.log('📋 Extracting business listings...');
    console.log(`🎯 Looking for businesses with ${minStars}-${maxStars} star ratings...`);
    console.log(`🔍 Minimum reviews required: ${minReviews}`);
    
    const businesses = [];
    let totalScanned = 0;
    let tooHighCount = 0;
    let tooLowCount = 0;
    let perfectCount = 0;
    
    const businessElements = await this.findBusinessElements();
    
    if (businessElements.length === 0) {
      throw new Error('No business elements found on the page.');
    }
    
    console.log(`📍 Found ${businessElements.length} potential business elements`);
    
    for (let i = 0; i < businessElements.length && businesses.length < maxBusinesses; i++) {
      const element = businessElements[i];
      
      try {
        const businessInfo = await this.extractBusinessInfoEnhanced(element);
        
        if (businessInfo && businessInfo.name) {
          totalScanned++;
          
          const ratingText = businessInfo.rating ? `${businessInfo.rating}⭐` : 'No rating';
          const reviewText = businessInfo.reviewCount ? `(${businessInfo.reviewCount} reviews)` : '(No reviews)';
          
          console.log(`📊 #${totalScanned}: ${businessInfo.name} - ${ratingText} ${reviewText}`);
          
          if (businessInfo.rating) {
            if (businessInfo.rating >= minStars && businessInfo.rating <= maxStars) {
              if (businessInfo.reviewCount >= minReviews) {
                const isDuplicate = businesses.some(b => b.name === businessInfo.name);
                
                if (!isDuplicate) {
                  businesses.push({
                    ...businessInfo,
                    serviceType: serviceType,
                    searchLocation: `${city}${state ? ', ' + state : ''}`,
                    extractedAt: new Date().toISOString()
                  });
                  
                  perfectCount++;
                  const urgency = businessInfo.rating < 2.0 ? 'CRITICAL' : 
                                 businessInfo.rating < 3.0 ? 'URGENT' : 'HIGH';
                  
                  console.log(`✅ ${urgency} LEAD #${perfectCount}: ${businessInfo.name} (${businessInfo.rating}⭐, ${businessInfo.reviewCount} reviews) - NEEDS HELP!`);
                } else {
                  console.log(`⚠️  DUPLICATE: ${businessInfo.name} - Already found`);
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
    
    console.log(`\n📊 SEARCH COMPLETE!`);
    console.log(`📋 Total businesses scanned: ${totalScanned}`);
    console.log(`✅ Opportunity leads (${minStars}-${maxStars}⭐): ${perfectCount}`);
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
    
    const businesses = await scraper.getBusinessesInArea(
      'plumbers',
      'Phoenix',
      'Arizona',
      { 
        minReviews: 2,
        maxBusinesses: 15
      }
    );

    console.log(`\n🎉 FINAL RESULTS: Found ${businesses.length} businesses with 2-3.9 star ratings:`);
    
    if (businesses.length > 0) {
      businesses.forEach((business, i) => {
        console.log(`\n${i+1}. ${business.name}`);
        console.log(`   ⭐ Rating: ${business.rating} (${business.reviewCount} reviews)`);
        console.log(`   📍 Address: ${business.address || 'Address not found'}`);
        console.log(`   📞 Phone: ${business.phone || 'Phone not found'}`);
        console.log(`   🌐 Website: ${business.website || 'Website not found'}`);
        console.log(`   💡 Outreach opportunity: Low rating needs reputation help!`);
      });
      
      if (!fs.existsSync('./test_results')) {
        fs.mkdirSync('./test_results', { recursive: true });
      }
      
      const testResults = {
        testDate: new Date().toISOString(),
        searchTerms: 'plumbers in Phoenix, Arizona',
        totalFound: businesses.length,
        businesses: businesses
      };
      
      fs.writeFileSync('./test_results/test_plumbers_phoenix.json', JSON.stringify(testResults, null, 2));
      console.log(`\n💾 Test results saved to: ./test_results/test_plumbers_phoenix.json`);
      
    } else {
      console.log('\n📝 No businesses found with 2-3.9 star ratings.');
      console.log('💡 Try a different city or service type, or lower the minReviews requirement.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    console.log('\n🔄 Closing browser...');
    await scraper.close();
  }
}

module.exports = ServiceBusinessLeadScraper;

if (require.main === module) {
  testSingleService();
}