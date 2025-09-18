# Overview

A comprehensive financial analytics dashboard for monitoring and managing long strangle options trading strategies. The application provides real-time visualization of profit/loss curves, portfolio performance metrics, and ticker management functionality. It also includes professional authentication, a gamified learning path, real-time options chain analysis, intelligent price alerts, and AI-powered exit recommendations. The platform aims to provide options traders with robust tools for tracking positions, managing risk, and making informed trading decisions for long strangle strategies across multiple securities.

## Current Production Status

✅ **Live Application**: Deployed and actively used  
✅ **User Engagement**: 24 API calls, 9 unique users, 178ms average response time  
✅ **Multi-Device Support**: Desktop/laptop access confirmed  
✅ **Geographic Reach**: United States user base established  
✅ **Finnhub Integration**: Primary stock quotes and real-time price data
✅ **Black-Scholes Options Pricing**: Current fallback system generating realistic options pricing based on live stock prices with symbol-specific volatility
✅ **MarketData.app Integration**: Active real-time options data integration with bid/ask spreads and market premiums
✅ **Critical Pricing Fixes**: Resolved major calculation bugs that caused options premiums to be 5-6x lower than market data - now shows realistic pricing aligned with actual market conditions

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The client-side application utilizes a modern React architecture with TypeScript. It features reusable UI components built with shadcn/ui and Radix UI, state management via TanStack Query and React hooks, Wouter for routing, and Tailwind CSS for styling. Recharts is used for interactive financial visualizations. The design prioritizes a clean light theme.

## Backend Architecture

The server implements an Express.js REST API with TypeScript. It provides endpoints for ticker and position management, an interface-based storage layer, and uses Drizzle ORM for strongly typed schemas. Middleware handles request logging, JSON parsing, and error handling.

## Data Storage Solutions

The database schema includes `Tickers` and `Long Strangle Positions` tables with a foreign key relationship. Production environments use PostgreSQL with Neon Database serverless connection, while development uses in-memory storage with mock data. Drizzle Kit is used for schema management.

## Technical Implementations & Features

- **Long Strangle Strategy Focus**: Dedicated support for long strangle positions with specific P&L calculation, portfolio summary, and implied volatility tracking.
- **Unified Position Calculator System**: Centralized calculation engine (`positionCalculator.ts`) ensuring consistent strike price selection, premium estimation, breakeven calculation, and max loss determination across all system components.
- **Watchlist Import**: Comprehensive import system supporting CSV, tab-separated, and simple text lists with symbol validation.
- **Live Stock Data Integration**: Real-time stock price data via Finnhub API with status indicators and refresh functionality.
- **Realistic Volatility Calculations**: Symbol-specific implied volatility calculations, IV percentile tracking, and automatic recalculation of position values based on live data.
- **Authentic Options Expiration Calendar**: Smart expiration date selection supporting weekly and monthly options expirations.
- **SaaS Authentication System**: Multi-user support with Replit Auth integration, a professional landing page, user/session storage in PostgreSQL, and secure cookie-based authentication.
- **Trading Insights Export**: Comprehensive export system for CSV, JSON, and text reports, including risk metrics and portfolio analytics.
- **Gamified Learning Path**: Interactive educational system with progressive modules, quizzes, and achievement tracking.
- **Contextual Trading Tips and Risk Warnings**: Intelligent alert system for portfolio conditions with actionable guidance.
- **Animated Risk Meter**: Combines portfolio volatility metrics and market sentiment for a real-time, color-coded risk assessment.
- **One-Click Options Strategy Screener**: Market screener for long strangle opportunities with filtering, preset strategies, and a "Top Pick" identification system.
- **Personalized Market Sentiment Dashboard**: AI-driven insights engine for market outlook, sector analysis, and personalized portfolio recommendations.
- **Interactive Tutorial Mode**: Guided walkthroughs for dashboard navigation, strategy basics, and platform features.
- **Personalized Trading Performance Achievement Badges**: Gamification system with badges across various categories based on user activity.
- **Professional Options Chain Integration**: Real-time options data viewer with bid/ask spreads, volume, open interest, Greeks analysis, and Premium column showing real market mid-prices.
- **Real Market Premium Integration**: Enhanced max loss calculations using actual market premiums from Market Data App instead of estimates for more accurate position analysis.
- **Market Data App API**: Production-ready integration with real options chain data, authentic bid/ask spreads, and market premiums for precise strangle position analysis.
- **Price Alerts & Exit Recommendations**: Intelligent price alert system and AI-powered exit recommendation engine based on market conditions.
- **Native Mobile App Capabilities**: Full Capacitor integration for iOS and Android deployment with native mobile features including haptic feedback, push notifications, status bar management, mobile-optimized navigation, and complete integration of live Finnhub data, WebSocket streaming, and realistic ±20 strike calculations for authentic mobile options trading experience.

# External Dependencies

- **Database Services**: Neon Database (PostgreSQL serverless), Drizzle ORM
- **UI Component Libraries**: Radix UI, shadcn/ui, Lucide React
- **Development Tools**: Vite, ESBuild, TypeScript
- **Visualization**: Recharts, react-day-picker
- **State Management**: TanStack React Query, React Hook Form, Zod
- **Real-time Data**: Finnhub API (stock quotes), MarketData.app (real options pricing and chains)
- **Authentication**: Replit Auth
- **Mobile Development**: Capacitor framework with iOS and Android platform support, native plugin integrations for app lifecycle, haptics, notifications, and status bar management
```