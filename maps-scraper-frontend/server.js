const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Import the scraper class from parent directory
const ServiceBusinessLeadScraper = require('../scraper.js');

// Scraper state
let scraperState = {
  isRunning: false,
  scraper: null,
  stats: {
    found: 0,
    emails: 0,
    scanned: 0,
    avgRating: null
  },
  progress: 0,
  statusText: 'Ready',
  logs: [],
  results: [],
  config: null
};

// Helper to add log
function addLog(message) {
  scraperState.logs.push({
    message,
    timestamp: new Date().toISOString()
  });

  // Keep only last 50 logs
  if (scraperState.logs.length > 50) {
    scraperState.logs = scraperState.logs.slice(-50);
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Google Maps Scraper' });
});

// Start scraper
app.post('/api/scraper/start', async (req, res) => {
  try {
    if (scraperState.isRunning) {
      return res.status(400).json({ error: 'Scraper already running' });
    }

    const {
      serviceType,
      city,
      state = '',
      maxResults = 10,
      minReviews = 2,
      minStars = 2.0,
      maxStars = 3.9,
      extractEmails = false
    } = req.body;

    if (!serviceType || !city) {
      return res.status(400).json({ error: 'Service type and city are required' });
    }

    // Reset state
    scraperState = {
      isRunning: true,
      scraper: new ServiceBusinessLeadScraper(),
      stats: { found: 0, emails: 0, scanned: 0, avgRating: null },
      progress: 0,
      statusText: 'Initializing browser...',
      logs: [],
      results: [],
      config: { serviceType, city, state, maxResults, minReviews, minStars, maxStars, extractEmails }
    };

    addLog(`Starting scraper for ${serviceType} in ${city}, ${state}`);
    addLog(`Settings: ${minStars}-${maxStars} stars, min ${minReviews} reviews, max ${maxResults} results`);

    // Send immediate response
    res.json({
      message: 'Scraper started',
      config: scraperState.config
    });

    // Run scraper in background
    runScraper(serviceType, city, state, {
      minReviews,
      maxBusinesses: maxResults,
      minStars,
      maxStars,
      extractEmails,
      maxScrolls: 15
    });

  } catch (error) {
    scraperState.isRunning = false;
    res.status(500).json({ error: error.message });
  }
});

// Background scraper runner
async function runScraper(serviceType, city, state, options) {
  try {
    addLog('Initializing browser...');
    scraperState.statusText = 'Initializing browser...';
    await scraperState.scraper.init();

    addLog('Browser initialized, starting search...');
    scraperState.statusText = 'Searching Google Maps...';
    scraperState.progress = 10;

    // Custom scraping function with progress updates
    await scraperState.scraper.searchServiceInArea(serviceType, city, state);

    addLog('Page loaded, finding businesses...');
    scraperState.statusText = 'Finding businesses...';
    scraperState.progress = 20;

    const businesses = [];
    const processedNames = new Set();
    let totalScanned = 0;
    let scrollAttempts = 0;
    const maxScrolls = options.maxScrolls || 15;

    while (scrollAttempts < maxScrolls && businesses.length < options.maxBusinesses) {
      if (!scraperState.isRunning) {
        addLog('Scraper stopped by user');
        break;
      }

      scrollAttempts++;
      addLog(`Scroll ${scrollAttempts}/${maxScrolls}, found ${businesses.length}/${options.maxBusinesses} so far...`);

      scraperState.progress = 20 + (scrollAttempts / maxScrolls) * 60;
      scraperState.statusText = `Scanning... (${businesses.length}/${options.maxBusinesses} found)`;

      const businessElements = await scraperState.scraper.findBusinessElements();

      if (businessElements.length === 0) {
        addLog('No more businesses found');
        break;
      }

      for (let i = 0; i < businessElements.length && businesses.length < options.maxBusinesses; i++) {
        if (!scraperState.isRunning) break;

        const element = businessElements[i];

        try {
          const businessInfo = await scraperState.scraper.extractBusinessInfoEnhanced(element);

          if (businessInfo && businessInfo.name && !processedNames.has(businessInfo.name)) {
            processedNames.add(businessInfo.name);
            totalScanned++;
            scraperState.stats.scanned = totalScanned;

            // Check if business meets criteria
            if (businessInfo.rating &&
                businessInfo.rating >= options.minStars &&
                businessInfo.rating <= options.maxStars &&
                businessInfo.reviewCount >= options.minReviews) {

              addLog(`Found: ${businessInfo.name} (${businessInfo.rating}⭐, ${businessInfo.reviewCount} reviews)`);

              // Click for details
              const details = await scraperState.scraper.clickBusinessForDetails(element);
              businessInfo.website = details.website || businessInfo.website || '';
              businessInfo.phone = details.phone || businessInfo.phone || '';
              businessInfo.address = details.address || businessInfo.address || '';

              // Extract email if enabled
              let email = null;
              if (options.extractEmails && businessInfo.website) {
                addLog(`Extracting email for ${businessInfo.name}...`);
                email = await scraperState.scraper.extractEmailFromWebsite(businessInfo.website, businessInfo.name);
                if (email) {
                  addLog(`Email found: ${email}`);
                  scraperState.stats.emails++;
                }
              }

              businesses.push({
                ...businessInfo,
                email: email || '',
                serviceType: serviceType,
                searchLocation: `${city}${state ? ', ' + state : ''}`,
                extractedAt: new Date().toISOString()
              });

              scraperState.stats.found = businesses.length;
              scraperState.results = businesses;

              // Calculate average rating
              const avgRating = businesses.reduce((sum, b) => sum + (b.rating || 0), 0) / businesses.length;
              scraperState.stats.avgRating = avgRating.toFixed(1);

              // Close details panel
              try {
                await scraperState.scraper.page.keyboard.press('Escape');
                await scraperState.scraper.waitFor(1000);
              } catch (e) {
                // Ignore
              }
            }
          }
        } catch (error) {
          addLog(`Error processing business: ${error.message}`);
        }
      }

      if (businesses.length >= options.maxBusinesses) {
        addLog(`Target reached: ${businesses.length} businesses found`);
        break;
      }

      // Scroll for more results
      if (scrollAttempts < maxScrolls) {
        await scraperState.scraper.scrollResultsPanel();
        await scraperState.scraper.waitFor(3000);
      }
    }

    addLog(`Scraping complete! Found ${businesses.length} businesses`);
    addLog(`Total scanned: ${totalScanned}, Emails found: ${scraperState.stats.emails}`);

    scraperState.progress = 100;
    scraperState.statusText = `Complete! Found ${businesses.length} businesses`;
    scraperState.results = businesses;

    // Save results to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `${serviceType.replace(/\s+/g, '_')}_${city}_${timestamp}`;

    scraperState.scraper.exportToCSV(businesses, `${filename}.csv`);
    scraperState.scraper.exportToJSON(businesses, `${filename}.json`);

    addLog(`Results saved to results/${filename}.csv and .json`);

    // Close browser
    await scraperState.scraper.close();
    scraperState.isRunning = false;

  } catch (error) {
    addLog(`Error: ${error.message}`);
    scraperState.statusText = `Error: ${error.message}`;
    scraperState.isRunning = false;

    if (scraperState.scraper) {
      try {
        await scraperState.scraper.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

// Stop scraper
app.post('/api/scraper/stop', async (req, res) => {
  try {
    scraperState.isRunning = false;
    addLog('Stop requested by user');

    if (scraperState.scraper) {
      await scraperState.scraper.close();
    }

    res.json({ message: 'Scraper stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get scraper status
app.get('/api/scraper/status', (req, res) => {
  res.json({
    isRunning: scraperState.isRunning,
    stats: scraperState.stats,
    progress: scraperState.progress,
    statusText: scraperState.statusText,
    logs: scraperState.logs,
    results: scraperState.results,
    config: scraperState.config
  });
});

// Get results
app.get('/api/scraper/results', (req, res) => {
  res.json({
    results: scraperState.results,
    count: scraperState.results.length
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🗺️  Google Maps Scraper Server running at http://localhost:${PORT}`);
  console.log(`📊 Open http://localhost:${PORT} in your browser to use the scraper\n`);
});
