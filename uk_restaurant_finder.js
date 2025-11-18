// uk_restaurant_finder.js - UK Restaurant Lead Finder (1-4.1 stars)
const ServiceBusinessLeadScraper = require('./scraper');

async function findUKRestaurantLeads() {
  const scraper = new ServiceBusinessLeadScraper();
  
  try {
    await scraper.init();
    console.log('🇬🇧 UK RESTAURANT LEAD SEARCH - 1.0 to 4.1 star businesses');
    console.log('🍽️  Target: UK restaurants that need reputation management help');
    
    // UK cities with high restaurant density and mixed reviews
    const ukRestaurantTargets = [
      // Major cities (competitive, lots of struggling restaurants)
      { service: 'restaurants', cities: ['Manchester, England', 'Birmingham, England', 'Leeds, England'] },
      { service: 'indian restaurants', cities: ['Bradford, England', 'Leicester, England', 'Oldham, England'] },
      { service: 'pizza restaurants', cities: ['Liverpool, England', 'Sheffield, England', 'Bristol, England'] },
      { service: 'chinese restaurants', cities: ['Newcastle, England', 'Nottingham, England', 'Hull, England'] },
      { service: 'fast food restaurants', cities: ['Coventry, England', 'Sunderland, England', 'Stoke-on-Trent, England'] },
      
      // Secondary cities (less competition, more opportunities)
      { service: 'takeaway restaurants', cities: ['Blackpool, England', 'Oldham, England', 'Rochdale, England'] },
      { service: 'curry houses', cities: ['Bolton, England', 'Wigan, England', 'Stockport, England'] },
      { service: 'fish and chips', cities: ['Middlesbrough, England', 'Blackburn, England', 'Burnley, England'] },
      { service: 'kebab shops', cities: ['Luton, England', 'Watford, England', 'Slough, England'] },
      { service: 'cafe restaurants', cities: ['Reading, England', 'Oxford, England', 'Cambridge, England'] },
      
      // Scotland & Wales
      { service: 'restaurants', cities: ['Glasgow, Scotland', 'Edinburgh, Scotland', 'Cardiff, Wales'] },
      { service: 'pubs with food', cities: ['Dundee, Scotland', 'Aberdeen, Scotland', 'Swansea, Wales'] }
    ];
    
    let allLeads = [];
    
    for (const businessType of ukRestaurantTargets) {
      console.log(`\n🍽️  Testing: ${businessType.service} in UK`);
      
      for (const cityState of businessType.cities) {
        const [city, country] = cityState.split(', ');
        console.log(`\n📍 Location: ${city}, ${country}`);
        
        try {
          const businesses = await scraper.getBusinessesInAreaExpanded(
            businessType.service,
            city,
            country,
            { 
              minReviews: 5,      // UK restaurants typically have more reviews
              maxBusinesses: 20,  // Get more per city
              minStars: 1.0,
              maxStars: 4.1
            }
          );
          
          if (businesses.length > 0) {
            console.log(`✅ GOLDMINE! Found ${businesses.length} restaurant leads in ${city}!`);
            allLeads.push(...businesses.map(b => ({
              ...b, 
              restaurantType: businessType.service,
              targetCity: `${city}, ${country}`,
              priority: b.rating < 2.0 ? 'CRITICAL' : 
                       b.rating < 3.0 ? 'URGENT' : 
                       b.rating < 3.5 ? 'HIGH' : 'MEDIUM'
            })));
          } else {
            console.log(`❌ No leads in ${city} for ${businessType.service}`);
          }
          
          await scraper.waitFor(3000); // Longer wait for UK searches
          
        } catch (error) {
          console.log(`❌ Error in ${city}: ${error.message}`);
          continue;
        }
        
        // Stop if we found enough leads
        if (allLeads.length >= 100) {
          console.log('🎉 Found 100+ leads! Stopping search to save time.');
          break;
        }
      }
      
      if (allLeads.length >= 100) break;
    }
    
    console.log(`\n🏆 TOTAL UK RESTAURANT RESULTS: Found ${allLeads.length} leads!`);
    
    if (allLeads.length > 0) {
      // Sort by priority (worst ratings first)
      allLeads.sort((a, b) => a.rating - b.rating);
      
      // Analyze UK restaurant data
      const analysis = {
        byRestaurantType: {},
        byRatingRange: {
          '1.0-2.0': allLeads.filter(l => l.rating >= 1.0 && l.rating < 2.0).length,
          '2.0-3.0': allLeads.filter(l => l.rating >= 2.0 && l.rating < 3.0).length,
          '3.0-4.0': allLeads.filter(l => l.rating >= 3.0 && l.rating < 4.0).length,
          '4.0-4.1': allLeads.filter(l => l.rating >= 4.0 && l.rating <= 4.1).length
        },
        byPriority: {
          'CRITICAL': allLeads.filter(l => l.priority === 'CRITICAL').length,
          'URGENT': allLeads.filter(l => l.priority === 'URGENT').length,
          'HIGH': allLeads.filter(l => l.priority === 'HIGH').length,
          'MEDIUM': allLeads.filter(l => l.priority === 'MEDIUM').length
        },
        byCity: {},
        byCountry: {
          'England': allLeads.filter(l => l.targetCity.includes('England')).length,
          'Scotland': allLeads.filter(l => l.targetCity.includes('Scotland')).length,
          'Wales': allLeads.filter(l => l.targetCity.includes('Wales')).length
        }
      };
      
      allLeads.forEach(lead => {
        // By restaurant type
        if (!analysis.byRestaurantType[lead.restaurantType]) {
          analysis.byRestaurantType[lead.restaurantType] = 0;
        }
        analysis.byRestaurantType[lead.restaurantType]++;
        
        // By city
        if (!analysis.byCity[lead.targetCity]) {
          analysis.byCity[lead.targetCity] = 0;
        }
        analysis.byCity[lead.targetCity]++;
      });
      
      console.log('\n📊 UK RESTAURANT LEAD ANALYSIS:');
      console.log('\n🍽️  By Restaurant Type:');
      Object.entries(analysis.byRestaurantType)
        .sort(([,a], [,b]) => b - a)
        .forEach(([type, count]) => {
          console.log(`   ${type}: ${count} leads`);
        });
      
      console.log('\n⭐ By Rating Range:');
      Object.entries(analysis.byRatingRange).forEach(([range, count]) => {
        console.log(`   ${range} stars: ${count} leads`);
      });
      
      console.log('\n🚨 By Priority Level:');
      Object.entries(analysis.byPriority).forEach(([priority, count]) => {
        console.log(`   ${priority}: ${count} restaurants`);
      });
      
      console.log('\n🇬🇧 By Country:');
      Object.entries(analysis.byCountry).forEach(([country, count]) => {
        console.log(`   ${country}: ${count} restaurants`);
      });
      
      console.log('\n🏙️  Top UK Cities:');
      Object.entries(analysis.byCity)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8)
        .forEach(([city, count]) => {
          console.log(`   ${city}: ${count} leads`);
        });
      
      console.log(`\n🔥 TOP 15 WORST-RATED UK RESTAURANTS (Highest Priority):`);
      allLeads.slice(0, 15).forEach((lead, i) => {
        console.log(`\n${i+1}. ${lead.name}`);
        console.log(`   🍽️  Type: ${lead.restaurantType}`);
        console.log(`   📍 Location: ${lead.targetCity}`);
        console.log(`   ⭐ Rating: ${lead.rating} (${lead.reviewCount} reviews)`);
        console.log(`   📞 Phone: ${lead.phone || 'TBD'}`);
        console.log(`   🌐 Website: ${lead.website || 'TBD'}`);
        console.log(`   🗺️  Google Maps: ${lead.googleMapsUrl || 'TBD'}`);
        console.log(`   🚨 Priority: ${lead.priority}`);
        console.log(`   💡 Opportunity: ${lead.rating < 2.5 ? 'CRISIS - Needs immediate help!' : 'Struggling - Good prospect'}`);
      });
      
      // Save comprehensive results
      const fs = require('fs');
      if (!fs.existsSync('./uk_restaurant_leads')) {
        fs.mkdirSync('./uk_restaurant_leads', { recursive: true });
      }
      
      const results = {
        searchDate: new Date().toISOString(),
        searchCriteria: 'UK Restaurants with 1.0-4.1 star ratings',
        searchLocation: 'United Kingdom (England, Scotland, Wales)',
        totalLeads: allLeads.length,
        analysis: analysis,
        leads: allLeads
      };
      
      fs.writeFileSync('./uk_restaurant_leads/uk_restaurant_leads.json', JSON.stringify(results, null, 2));
      console.log(`\n💾 All UK restaurant leads saved to: ./uk_restaurant_leads/uk_restaurant_leads.json`);
      
      // Create priority CSV for outreach
      const csvHeader = 'Restaurant Name,Type,City,Country,Rating,Reviews,Phone,Website,Google Maps URL,Priority,Opportunity Level\n';
      const csvData = allLeads.map(lead => {
        const opportunityLevel = lead.rating < 2.5 ? 'CRISIS' : lead.rating < 3.5 ? 'STRUGGLING' : 'IMPROVEMENT';
        return `"${lead.name}","${lead.restaurantType}","${lead.targetCity}",${lead.rating},${lead.reviewCount},"${lead.phone || 'TBD'}","${lead.website || 'TBD'}","${lead.googleMapsUrl || 'TBD'}","${lead.priority}","${opportunityLevel}"`;
      }).join('\n');
      
      fs.writeFileSync('./uk_restaurant_leads/uk_restaurant_outreach.csv', csvHeader + csvData);
      console.log(`📊 UK restaurant outreach CSV saved to: ./uk_restaurant_leads/uk_restaurant_outreach.csv`);
      
      console.log(`\n🎯 UK RESTAURANT OUTREACH STRATEGY:`);
      console.log(`   • ${analysis.byPriority.CRITICAL} restaurants in CRISIS (1-2 stars) - IMMEDIATE OPPORTUNITY`);
      console.log(`   • ${analysis.byPriority.URGENT} restaurants STRUGGLING (2-3 stars) - HIGH CONVERSION RATE`);
      console.log(`   • ${analysis.byPriority.HIGH} restaurants need IMPROVEMENT (3-3.5 stars) - GOOD PROSPECTS`);
      console.log(`   • Focus on curry houses, takeaways, and fast food (typically most issues)`);
      
      // UK-specific outreach messages
      console.log(`\n💬 UK RESTAURANT OUTREACH MESSAGES:`);
      console.log(`\n🚨 For CRITICAL UK restaurants (1-2 stars):`);
      console.log(`   "Hi [Restaurant Name], I noticed your Google reviews are really impacting your business. I help UK restaurants in crisis turn their reputation around quickly. With food delivery apps and online reviews being so important now, poor ratings are costing you customers daily. Can we have a quick 15-minute chat about how I can help stop this bleeding?"`);
      
      console.log(`\n⚠️  For STRUGGLING UK restaurants (2-3 stars):`);
      console.log(`   "Hi [Restaurant Name], I see you're getting mixed reviews on Google. I specialise in helping UK ${allLeads[0]?.restaurantType || 'restaurants'} improve from 2-3 star ratings to 4.5+ stars consistently. With Just Eat, Deliveroo, and Uber Eats all showing Google ratings, this could dramatically increase your orders. Interested in a quick conversation?"`);
      
      console.log(`\n📈 For HIGH priority UK restaurants (3-4.1 stars):`);
      console.log(`   "Hi [Restaurant Name], You're doing well with a ${allLeads.find(l => l.priority === 'HIGH')?.rating || 3.5} star rating, but I help UK restaurants like yours break through to the 4.5+ star level where you'll really dominate your local area. With the competitive UK food scene, those extra stars mean significantly more customers. Would you like to know how?"`);
      
      // UK market insights
      console.log(`\n🇬🇧 UK MARKET INSIGHTS:`);
      console.log(`   • UK consumers heavily rely on Google/TripAdvisor reviews for restaurant choices`);
      console.log(`   • Food delivery apps (Just Eat, Deliveroo, Uber Eats) show Google ratings`);
      console.log(`   • Post-COVID, online reputation is more critical than ever`);
      console.log(`   • UK restaurants face intense competition - reputation is key differentiator`);
      console.log(`   • Focus on: Customer service, food quality, delivery experience`);
      
    } else {
      console.log('\n💡 NO UK RESTAURANT LEADS FOUND');
      console.log('🔄 Try expanding search criteria:');
      console.log('   • Lower minimum review requirement to 3');
      console.log('   • Add more UK cities (Portsmouth, Southampton, etc.)');
      console.log('   • Include Northern Ireland cities');
      console.log('   • Try different restaurant types (Turkish, Thai, etc.)');
    }
    
  } catch (error) {
    console.error('❌ UK Restaurant search failed:', error);
  } finally {
    await scraper.close();
  }
}

findUKRestaurantLeads();