# Live Stock Data Setup Guide

This dashboard can display real-time stock prices using the Finnhub API. Here's how to set it up:

## Getting Your Free API Key

1. **Visit Finnhub**: Go to [finnhub.io](https://finnhub.io)
2. **Sign up**: Create a free account
3. **Get API key**: After signing up, you'll find your API key in your dashboard
4. **Free tier includes**: 60 API calls per minute, real-time data for US stocks

## Adding Your API Key to Replit

1. **Open Secrets**: In your Replit project, click the 🔒 "Secrets" tab in the left sidebar
2. **Add new secret**:
   - Key: `FINNHUB_API_KEY`
   - Value: Your API key from Finnhub (should look like: `ch8abc123def456ghi789`)
3. **Save**: Click "Add secret"

## Features with Live Data

Once configured, you'll have access to:

### ✅ Live Price Updates
- Real-time current prices for all stocks
- Actual price changes and percentage moves
- Updated company information

### ✅ Dynamic Position Generation
- Strike prices automatically calculated based on current market price
- Realistic premiums based on stock volatility
- Proper breakeven calculations

### ✅ Fresh Data for New Tickers
- Add any stock symbol (AAPL, GOOGL, MSFT, etc.)
- Automatically fetch current market data
- Generate realistic long strangle positions

### ✅ Refresh Functionality
- "Update Prices" button appears when API is connected
- Updates all existing tickers with live prices
- Toast notifications confirm successful updates

## Dashboard Indicators

- 🟢 **"Live Data"** badge: API connected and working
- 🔴 **"API Error"** badge: API key provided but connection failed
- ⚪ **"Mock Data"** badge: No API key configured (using sample data)

## Troubleshooting

### API Error Badge Appears
- Check that your FINNHUB_API_KEY is correctly set in Secrets
- Verify your API key is valid by testing it at [finnhub.io/docs/api](https://finnhub.io/docs/api)
- Ensure you haven't exceeded the 60 calls/minute limit

### Still Seeing Mock Data
- Make sure the secret key name is exactly: `FINNHUB_API_KEY`
- Restart your Replit application after adding the secret
- Check the Console logs for any error messages

## Without API Key

The dashboard works perfectly with sample data when no API key is provided:
- Shows realistic mock prices for major stocks (AAPL, NVDA, TSLA, etc.)
- All features work normally
- Perfect for testing and demonstration

## Support

- Finnhub API documentation: [finnhub.io/docs/api](https://finnhub.io/docs/api)
- Free tier provides 60 calls/minute which is excellent for personal use
- Upgrade to paid plans for higher limits and additional features