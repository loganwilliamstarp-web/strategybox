# Options Tracker

## Overview

Options Tracker is a comprehensive options trading platform built with React and Node.js that allows users to track and analyze options strategies in real-time. The application provides professional-grade trading tools including strategy calculators, real-time price updates, P&L visualization, and portfolio management. It features a modular strategy system supporting multiple options strategies (Long/Short Strangle, Iron Condor, Butterfly Spread, and Diagonal Calendar), real-time WebSocket data streaming, and mobile-native support through Capacitor.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript and Vite build system
- **UI Components**: Radix UI primitives with shadcn/ui design system
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **State Management**: React Query for server state and built-in React state
- **Real-time Updates**: Custom WebSocket hooks for live price streaming
- **Mobile Support**: Progressive Web App with Capacitor for native iOS/Android builds

### Backend Architecture
- **Runtime**: Node.js with Express.js server framework
- **Database**: PostgreSQL via Drizzle ORM with Supabase as primary database
- **Authentication**: Passport.js with session-based authentication and bcrypt password hashing
- **Session Storage**: In-memory session store for development with database fallback
- **Real-time Communication**: WebSocket server for live price updates and strategy recalculations
- **API Architecture**: RESTful endpoints with modular route separation
- **Data Archival**: Automated weekly archival system for expired options data with historical preservation

### Strategy System
- **Pattern**: Strategy Factory pattern with dedicated calculators for each options strategy
- **Modular Design**: Separate TypeScript files for each strategy type (LongStrangleStrategy, ShortStrangleStrategy, IronCondorStrategy, ButterflySpreadStrategy, DiagonalCalendarStrategy)
- **Calculations**: Real-time P&L calculations, Greeks computation, breakeven analysis, and risk metrics
- **Performance**: Strategy calculations cached and optimized for real-time updates

### Performance Optimization
- **Caching Layer**: Multi-tier caching with 30-second API cache and 24-hour fallback
- **Batched Requests**: API call batching reducing external requests by 90%
- **Smart Updates**: Differential update intervals (1 minute for prices, 15 minutes for options data)
- **WebSocket Management**: Optimized connection pooling and user-based subscriptions

### Security & Rate Limiting
- **API Key Security**: ALL API keys exclusively loaded from Supabase vault with zero environment fallbacks
- **Rate Limiting**: Configurable limits per endpoint type with automatic cleanup
- **CORS**: Configured for development and production environments
- **Input Validation**: Comprehensive validation for all API endpoints
- **Error Handling**: Structured error responses with correlation IDs
- **Secure Credential Management**: MarketData.app and Finnhub API keys managed via Supabase secrets vault

### Database Archival System
- **Historical Preservation**: Automated weekly archival of expired options contracts to `historical_options_chains` table
- **Smart Scheduling**: Dual-tier cleanup system with daily stale data removal and weekly historical archival
- **Data Integrity**: Transaction-safe archival process with advisory locks to prevent conflicts
- **Performance Optimization**: Expired options moved to dedicated historical table instead of deletion
- **Retention Policy**: 7-day retention in main table before archival, preserving complete historical data
- **Conflict Prevention**: Global cleanup locks and database-based scheduling to avoid concurrent operations

### Mobile Architecture
- **Capacitor Integration**: Native iOS/Android app generation from web codebase
- **Native Features**: Haptic feedback, push notifications, splash screen, status bar control
- **Responsive Design**: Mobile-first design with touch-optimized interfaces
- **Offline Support**: Service worker integration for offline functionality

## External Dependencies

### Database Services
- **Supabase**: Primary PostgreSQL database hosting with real-time subscriptions
- **Drizzle ORM**: Type-safe database interactions with schema management

### Market Data APIs
- **MarketData.app**: Primary source for options chain data, implied volatility, and Greeks
- **Finnhub**: Fallback for real-time stock prices and market data
- **Charles Schwab API**: Configured for professional options data (pending OAuth service restoration)

### Cloud Services
- **Vercel**: Production deployment platform with edge caching and serverless functions
- **AWS Secrets Manager**: Secure credential storage and automatic rotation (optional)

### Development Tools
- **Capacitor**: Cross-platform mobile app development with native plugin access
- **Vitest**: Testing framework with coverage reporting
- **React Query**: Server state management with caching and background updates
- **WebSocket**: Real-time data streaming for price updates and strategy recalculations

### Authentication & Security
- **Passport.js**: Authentication middleware with local strategy
- **bcryptjs**: Password hashing and comparison
- **express-session**: Session management with configurable storage options
- **CORS**: Cross-origin resource sharing configuration

### UI & Styling
- **Radix UI**: Accessible component primitives
- **shadcn/ui**: Pre-built component library
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for consistent iconography