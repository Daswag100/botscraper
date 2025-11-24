# Google Maps Business Scraper - Web Frontend

A beautiful web interface for scraping business leads from Google Maps with contact information.

## Features

- Modern, responsive web UI
- Real-time scraping progress updates
- Customizable scraping parameters (service type, location, rating range)
- Email extraction from business websites (optional)
- Quick presets for common use cases
- Live activity logs
- Export results as CSV or JSON
- Statistics dashboard

## Installation

```bash
cd maps-scraper-frontend
npm install
```

## Usage

### Start the server:

```bash
npm start
```

The server will start on http://localhost:3001

### Open your browser:

Navigate to http://localhost:3001 and you'll see the scraper interface.

### Configure and start scraping:

1. Enter the service type (e.g., "plumbers", "roofers")
2. Enter the city and state
3. Set the rating range (e.g., 2.0-3.9 stars for businesses that need help)
4. Set minimum reviews and max results
5. Choose whether to extract emails (slower but gets more data)
6. Click "Start Scraping"

### Quick Presets:

Use the preset buttons to quickly load common configurations:
- Plumbers (2-3.9 stars)
- Roofers (2-3.9 stars)
- Solar Companies (2-3.9 stars)
- Restaurants (1-3.5 stars)

## API Endpoints

- `GET /api/health` - Check server health
- `POST /api/scraper/start` - Start scraping
- `POST /api/scraper/stop` - Stop scraping
- `GET /api/scraper/status` - Get current status
- `GET /api/scraper/results` - Get results

## Results

Results are automatically saved to the `results/` directory as both CSV and JSON files when scraping completes.

You can also download results directly from the web interface using the Download buttons.

## Notes

- The scraper runs with a visible browser window so you can monitor progress
- Email extraction visits each business website which significantly increases scraping time
- Results include: business name, rating, reviews, phone, email, website, address
- The scraper respects Google's rate limits by scrolling progressively

## Troubleshooting

If the server fails to start:
- Make sure port 3001 is not in use
- Check that the parent scraper.js file exists
- Ensure all dependencies are installed

If scraping fails:
- Check your internet connection
- Make sure Google Maps is accessible
- Try reducing the max results or disabling email extraction
