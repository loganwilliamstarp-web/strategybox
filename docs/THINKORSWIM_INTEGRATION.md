# ThinkOrSwim Watchlist Integration Guide

This guide shows you how to export your watchlists from ThinkOrSwim and import them into your Long Strangle Analytics dashboard.

## Exporting from ThinkOrSwim Desktop

### Method 1: Export Watchlist to CSV/Text
1. Open your ThinkOrSwim desktop application
2. Navigate to the **Watchlist** tab
3. Right-click on your watchlist name (e.g., "My Watchlist")
4. Select **"Export list..."** or **"Save list..."**
5. Choose your export format:
   - **CSV format** (recommended): `Symbol, Company, Last, Change, %Change`
   - **Text format**: Tab-separated values
6. Save the file to your computer

### Method 2: Copy and Paste Symbols
1. In your ThinkOrSwim watchlist, select all symbols (Ctrl+A)
2. Copy the selection (Ctrl+C)
3. Paste directly into the dashboard's text area

## Exporting from ThinkOrSwim Web/Mobile

### From thinkorswim.com Web Platform
1. Log into your TD Ameritrade account at thinkorswim.com
2. Navigate to **"Watchlists"** in the main menu
3. Select your desired watchlist
4. Copy the symbols directly or use browser tools to export

### From Mobile App
1. Open the TD Ameritrade mobile app
2. Go to **"Watchlists"**
3. Select your watchlist
4. Copy symbols manually (unfortunately, no bulk export available)

## Supported File Formats

The dashboard accepts multiple formats:

### 1. CSV Format (Recommended)
```
Symbol,Company Name,Last Price,Change,% Change
AAPL,Apple Inc.,202.92,-0.43,-0.21%
TSLA,Tesla Inc.,308.72,-0.54,-0.17%
MSFT,Microsoft Corp.,415.26,2.34,0.57%
```

### 2. Tab-Separated Format
```
AAPL	Apple Inc.	202.92	-0.43	-0.21%
TSLA	Tesla Inc.	308.72	-0.54	-0.17%
MSFT	Microsoft Corp.	415.26	2.34	0.57%
```

### 3. Simple Symbol List
```
AAPL
TSLA
MSFT
GOOGL
AMZN
```

## Import Process

1. **Upload File**: Click "Choose File" and select your exported watchlist
2. **Or Paste Data**: Copy your watchlist data and paste it into the text area
3. **Parse Data**: Click "Parse Data" to preview the symbols
4. **Review**: Check that all symbols were parsed correctly
5. **Import**: Click "Import All Symbols" to add them to your dashboard

## Tips for Best Results

- **Clean Data**: Remove any header rows or non-symbol text before importing
- **Symbol Validation**: Only valid stock symbols (1-5 letters) will be imported
- **Duplicate Handling**: The system automatically removes duplicate symbols
- **Live Data**: Once imported, symbols will automatically fetch live market data via Finnhub API

## Common Issues & Solutions

### Issue: "No symbols found"
- **Solution**: Check that your data contains valid stock symbols
- **Solution**: Remove any header rows (like "Symbol", "Name", etc.)
- **Solution**: Ensure symbols are separated by commas, tabs, or new lines

### Issue: "Some symbols failed to import"
- **Solution**: Invalid symbols (bonds, futures, options) are skipped
- **Solution**: Check that symbols are active and tradeable on major exchanges

### Issue: "Missing company names"
- **Solution**: Company names are optional - the system will fetch them from live data
- **Solution**: Export from ThinkOrSwim with full details for best results

## Example ThinkOrSwim Export

Here's what a typical ThinkOrSwim CSV export looks like:

```
Symbol,Description,Last,Mark,Change,% Chg,Volume,Bid,Ask
AAPL,Apple Inc. Common Stock,202.92,202.92,-0.43,-0.21%,41523456,202.85,202.95
TSLA,"Tesla, Inc. Common Stock",308.72,308.72,-0.54,-0.17%,89234567,308.65,308.75
MSFT,Microsoft Corporation Common Stock,415.26,415.26,2.34,0.57%,25345678,415.20,415.30
```

The dashboard will automatically parse this format and extract the necessary information.

## Need Help?

If you're having trouble with the import process:

1. Try the simple symbol list format (one symbol per line)
2. Check that your symbols are valid stock tickers
3. Ensure your file doesn't contain special characters or formatting
4. Contact support if you continue to experience issues

Happy trading with your Long Strangle Analytics dashboard!