import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, BarChart3, Calendar, Target, Shield, Zap, Activity, DollarSign, PieChart, LineChart } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Progress } from "@/components/ui/progress";


export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-foreground" data-testid="page-title">
                Long Strangle Analytics
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Button 
                onClick={() => window.location.href = '/auth'}
                data-testid="button-login"
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Clean gradient background with left to right fade */}
        <div className="absolute inset-0">
          {/* Simple left-to-right gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-50 via-slate-25 to-transparent dark:from-slate-900/50 dark:via-slate-800/20 dark:to-transparent"></div>
          
          {/* Subtle accent gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent dark:from-primary/5 dark:via-transparent dark:to-transparent"></div>
          
          {/* Minimal geometric element */}
          <div className="absolute left-0 top-0 w-1/2 h-full">
            <div className="absolute top-20 left-16 w-64 h-64 bg-primary/5 dark:bg-primary/3 rounded-full blur-3xl"></div>
          </div>
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-foreground mb-6">
            Master Long Strangle 
            <span className="text-primary"> Options Trading</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-6 max-w-2xl mx-auto">
            Professional-grade analytics platform for tracking and optimizing your long strangle positions 
            with real-time data, volatility analysis, and comprehensive portfolio management.
          </p>
          <div className="flex justify-center mb-6">
            <Badge variant="secondary" className="text-lg px-6 py-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
              14-Day Free Trial • No Credit Card Required
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => window.location.href = '/auth'}
              data-testid="button-get-started"
              className="text-lg px-8 py-3"
            >
              Start Free Trial
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => window.location.href = '/auth'}
              data-testid="button-sign-in"
            >
              Sign In
            </Button>
          </div>
        </div>
      </section>

      {/* Analytics Preview Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-muted/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-3">
              Real-Time Analytics Dashboard
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Professional-grade analytics with live market data, volatility tracking, and comprehensive position analysis
            </p>
          </div>

          {/* Sample Analytics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Positions</CardTitle>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">12</div>
                <p className="text-xs text-muted-foreground">
                  +3 from last week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">+$2,847</div>
                <p className="text-xs text-muted-foreground">
                  +12.3% this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg IV Percentile</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">68%</div>
                <Progress value={68} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Premium Deployed</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">$18,450</div>
                <p className="text-xs text-muted-foreground">
                  Across 12 positions
                </p>
              </CardContent>
            </Card>
          </div>


        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-8">
            Professional Trading Analytics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="p-6">
              <div className="flex items-center mb-4">
                <TrendingUp className="h-8 w-8 text-primary mr-3" />
                <h3 className="text-lg font-semibold text-foreground">Live Market Integration</h3>
              </div>
              <p className="text-muted-foreground">
                Professional APIs deliver real-time stock prices, options data, and market analytics. 
                Track IV percentiles, price movements, and volatility trends with institutional-grade accuracy.
              </p>
              <div className="mt-4">
                <Badge variant="secondary" className="mr-2">Finnhub API</Badge>
                <Badge variant="secondary">60-second updates</Badge>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center mb-4">
                <BarChart3 className="h-8 w-8 text-primary mr-3" />
                <h3 className="text-lg font-semibold text-foreground">Advanced P&L Analytics</h3>
              </div>
              <p className="text-muted-foreground">
                Interactive profit/loss visualization with breakeven analysis, strike price markers, 
                and time decay modeling. Understand position performance across all price scenarios.
              </p>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Position Analysis</span>
                  <span className="text-green-600">+15.2% avg return</span>
                </div>
                <Progress value={85} className="h-2" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center mb-4">
                <Target className="h-8 w-8 text-primary mr-3" />
                <h3 className="text-lg font-semibold text-foreground">IV Percentile Tracking</h3>
              </div>
              <p className="text-muted-foreground">
                Symbol-specific implied volatility analysis with historical percentile rankings. 
                Identify when options are expensive or cheap relative to their 52-week range.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-2 bg-green-100 dark:bg-green-900/20 rounded">
                  <div className="font-semibold text-green-700 dark:text-green-400">Low IV</div>
                  <div className="text-green-600 dark:text-green-500">0-30%</div>
                </div>
                <div className="text-center p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded">
                  <div className="font-semibold text-yellow-700 dark:text-yellow-400">Med IV</div>
                  <div className="text-yellow-600 dark:text-yellow-500">30-70%</div>
                </div>
                <div className="text-center p-2 bg-red-100 dark:bg-red-900/20 rounded">
                  <div className="font-semibold text-red-700 dark:text-red-400">High IV</div>
                  <div className="text-red-600 dark:text-red-500">70-100%</div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center mb-4">
                <Calendar className="h-8 w-8 text-primary mr-3" />
                <h3 className="text-lg font-semibold text-foreground">Smart Expiration Engine</h3>
              </div>
              <p className="text-muted-foreground">
                Authentic options calendar with weekly and monthly expiration logic. 
                Automatically selects optimal expiration dates based on current market conditions.
              </p>
              <div className="mt-4 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Next Weekly:</span>
                  <span className="font-mono">Jan 10, 2025</span>
                </div>
                <div className="flex justify-between">
                  <span>Next Monthly:</span>
                  <span className="font-mono">Jan 17, 2025</span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center mb-4">
                <Shield className="h-8 w-8 text-primary mr-3" />
                <h3 className="text-lg font-semibold text-foreground">Risk Analytics</h3>
              </div>
              <p className="text-muted-foreground">
                Comprehensive risk assessment with maximum loss calculations, breakeven analysis, 
                and portfolio-level exposure tracking across all positions.
              </p>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Max Risk per Trade</span>
                  <span className="text-red-600">$650 avg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Portfolio Beta</span>
                  <span>0.85</span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center mb-4">
                <Zap className="h-8 w-8 text-primary mr-3" />
                <h3 className="text-lg font-semibold text-foreground">Portfolio Intelligence</h3>
              </div>
              <p className="text-muted-foreground">
                Advanced portfolio metrics including correlation analysis, sector exposure, 
                and performance attribution. Make data-driven decisions with institutional-level insights.
              </p>
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>Win Rate</span>
                  <span className="text-green-600">73.2%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Avg Days Held</span>
                  <span>28 days</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Try Risk-Free for 14 Days
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            Join professional traders who rely on our platform for options analysis. 
            Full access to all features during your trial period.
          </p>
          
          {/* Trial Features */}
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary mb-2">14 Days</div>
              <div className="text-sm text-muted-foreground">Complete access to all features</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary mb-2">No Card</div>
              <div className="text-sm text-muted-foreground">Start immediately without payment</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary mb-2">Cancel Anytime</div>
              <div className="text-sm text-muted-foreground">No commitment or hidden fees</div>
            </div>
          </div>
          
          <div className="flex justify-center mb-6">
            <Badge variant="secondary" className="text-lg px-6 py-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
              14-Day Free Trial • No Credit Card Required
            </Badge>
          </div>
          <Button 
            size="lg"
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-start-free"
            className="text-lg px-8 py-3"
          >
            Start Your 14-Day Free Trial
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-muted-foreground">
            © 2025 Long Strangle Analytics. Professional options trading platform.
          </p>
        </div>
      </footer>
    </div>
  );
}