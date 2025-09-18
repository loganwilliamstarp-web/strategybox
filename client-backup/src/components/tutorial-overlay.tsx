import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, ChevronLeft, Play, X, CheckCircle, Target, TrendingUp, BarChart3, Lightbulb } from "lucide-react";

interface TutorialStep {
  id: string;
  title: string;
  content: string;
  target: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: 'click' | 'input' | 'observe';
  actionText?: string;
  highlight?: boolean;
}

interface TutorialModule {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  estimatedTime: number;
  steps: TutorialStep[];
}

interface TutorialOverlayProps {
  isFirstLogin: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function TutorialOverlay({ isFirstLogin, onComplete, onSkip }: TutorialOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentModule, setCurrentModule] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const tutorialModules: TutorialModule[] = [
    {
      id: 'dashboard-overview',
      title: 'Dashboard Overview',
      description: 'Learn to navigate your options trading dashboard',
      icon: <BarChart3 className="h-5 w-5" />,
      estimatedTime: 3,
      steps: [
        {
          id: 'welcome',
          title: 'Welcome to Long Strangle Analytics',
          content: 'This dashboard helps you track and analyze long strangle options positions. Let\'s start with a quick tour of the main features.',
          target: '[data-testid="page-title"]',
          position: 'bottom'
        },
        {
          id: 'search-ticker',
          title: 'Adding Your First Position',
          content: 'Use this search box to add stock tickers to your portfolio. Try searching for "AAPL" to add Apple to your watchlist.',
          target: '[data-testid="input-ticker-search"]',
          position: 'bottom',
          action: 'input',
          actionText: 'Type "AAPL" and press Enter'
        },
        {
          id: 'portfolio-summary',
          title: 'Portfolio Summary',
          content: 'This section shows your portfolio metrics including total premium paid, active positions, and average implied volatility.',
          target: '[data-testid="text-portfolio-title"]',
          position: 'right'
        },
        {
          id: 'risk-meter',
          title: 'Risk Analysis',
          content: 'The risk meter analyzes your portfolio\'s volatility exposure in real-time, helping you understand your risk level.',
          target: '[data-testid="card-risk-meter"]',
          position: 'top'
        }
      ]
    },
    {
      id: 'long-strangle-basics',
      title: 'Long Strangle Strategy',
      description: 'Understand the fundamentals of long strangle options trading',
      icon: <Target className="h-5 w-5" />,
      estimatedTime: 5,
      steps: [
        {
          id: 'strategy-overview',
          title: 'What is a Long Strangle?',
          content: 'A long strangle involves buying both a call and put option with different strike prices but the same expiration date. You profit when the stock moves significantly in either direction.',
          target: 'body',
          position: 'top'
        },
        {
          id: 'profit-loss',
          title: 'Understanding Profit & Loss',
          content: 'Long strangles have two breakeven points. You make money when the stock price moves beyond either the upper or lower breakeven level.',
          target: '[data-testid="card-ticker-AAPL"]',
          position: 'top'
        },
        {
          id: 'implied-volatility',
          title: 'Implied Volatility Importance',
          content: 'Long strangles benefit from high implied volatility. The IV percentile shows how current volatility compares to historical levels.',
          target: '[data-testid="text-iv-percentile"]',
          position: 'bottom'
        },
        {
          id: 'time-decay',
          title: 'Time Decay Risk',
          content: 'Options lose value as expiration approaches. Monitor days to expiry and consider closing positions that are profitable or rolling to later dates.',
          target: '[data-testid="text-days-to-expiry"]',
          position: 'top'
        }
      ]
    },
    {
      id: 'market-analysis',
      title: 'Market Analysis Tools',
      description: 'Discover tools for market sentiment and strategy screening',
      icon: <TrendingUp className="h-5 w-5" />,
      estimatedTime: 4,
      steps: [
        {
          id: 'market-sentiment',
          title: 'Market Sentiment Analysis',
          content: 'This section provides AI-driven insights about market conditions, VIX levels, and how they affect your long strangle positions.',
          target: '.pt-4.border-t',
          position: 'top'
        },
        {
          id: 'strategy-screener',
          title: 'Strategy Screener',
          content: 'The screener helps you find new long strangle opportunities by analyzing IV percentiles, premiums, and market conditions across multiple stocks.',
          target: '[data-testid="card-strategy-screener"]',
          position: 'top'
        },
        {
          id: 'trading-tips',
          title: 'Contextual Trading Tips',
          content: 'Get real-time alerts about your positions including high IV warnings, expiration notices, and profit-taking opportunities.',
          target: '[data-testid="card-trading-tips"]',
          position: 'top'
        }
      ]
    },
    {
      id: 'advanced-features',
      title: 'Advanced Features',
      description: 'Export insights, learning modules, and portfolio management',
      icon: <Lightbulb className="h-5 w-5" />,
      estimatedTime: 3,
      steps: [
        {
          id: 'export-insights',
          title: 'Export Trading Insights',
          content: 'Export detailed analysis of your positions including risk metrics, market insights, and recommended actions in multiple formats.',
          target: '[data-testid="card-export-insights"]',
          position: 'top'
        },
        {
          id: 'learning-path',
          title: 'Interactive Learning',
          content: 'Access the gamified learning system to master options trading concepts through interactive modules and quizzes.',
          target: '[data-testid="button-learning"]',
          position: 'bottom'
        },
        {
          id: 'view-toggle',
          title: 'Display Preferences',
          content: 'Switch between card and list views to customize how you prefer to see your position data.',
          target: '[data-testid="button-grid-view"]',
          position: 'bottom'
        }
      ]
    }
  ];

  useEffect(() => {
    if (isFirstLogin) {
      const hasSeenTutorial = localStorage.getItem('tutorial-completed');
      if (!hasSeenTutorial) {
        setTimeout(() => setIsVisible(true), 1000);
      }
    }
  }, [isFirstLogin]);

  const handleStartTutorial = (moduleIndex: number) => {
    setCurrentModule(moduleIndex);
    setCurrentStep(0);
  };

  const handleNextStep = () => {
    if (currentModule === null) return;
    
    const module = tutorialModules[currentModule];
    if (currentStep < module.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Module completed
      localStorage.setItem(`tutorial-module-${currentModule}-completed`, 'true');
      
      if (currentModule < tutorialModules.length - 1) {
        // Show continuation prompt
        setCurrentModule(null);
        setCurrentStep(0);
      } else {
        // All modules completed
        handleCompleteTutorial();
      }
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else if (currentModule !== null && currentModule > 0) {
      setCurrentModule(currentModule - 1);
      setCurrentStep(tutorialModules[currentModule - 1].steps.length - 1);
    }
  };

  const handleCompleteTutorial = () => {
    setIsCompleted(true);
    localStorage.setItem('tutorial-completed', 'true');
    setTimeout(() => {
      setIsVisible(false);
      onComplete();
    }, 2000);
  };

  const handleSkipTutorial = () => {
    localStorage.setItem('tutorial-completed', 'true');
    setIsVisible(false);
    setCurrentModule(null);
    setCurrentStep(0);
    setIsCompleted(false);
    onSkip();
  };

  const getCurrentProgress = () => {
    if (currentModule === null) return 0;
    const totalSteps = tutorialModules.reduce((sum, module) => sum + module.steps.length, 0);
    const completedSteps = tutorialModules.slice(0, currentModule).reduce((sum, module) => sum + module.steps.length, 0) + currentStep;
    return (completedSteps / totalSteps) * 100;
  };

  const getHighlightTarget = () => {
    if (currentModule === null) return null;
    const currentStepData = tutorialModules[currentModule].steps[currentStep];
    return currentStepData.target;
  };

  if (!isVisible) return null;

  return (
    <Dialog open={isVisible} onOpenChange={(open) => {
      if (!open) {
        handleSkipTutorial();
      }
    }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <div className="p-2 rounded-full bg-blue-500/10">
                <Play className="h-5 w-5 text-blue-600" />
              </div>
              <span>Interactive Tutorial</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkipTutorial}
                className="ml-auto"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          {isCompleted ? (
            <div className="text-center py-8">
              <div className="mb-4">
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Tutorial Completed!</h3>
              <p className="text-muted-foreground">
                You're now ready to start analyzing long strangle strategies. Happy trading!
              </p>
            </div>
          ) : currentModule === null ? (
            <div className="space-y-6">
              <div className="text-center">
                {localStorage.getItem('tutorial-module-0-completed') ? (
                  <>
                    <h3 className="text-xl font-semibold mb-2">Great Progress!</h3>
                    <p className="text-muted-foreground">
                      You've completed a module. Ready to continue learning or would you like to explore the dashboard?
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-semibold mb-2">Welcome to Your Trading Dashboard</h3>
                    <p className="text-muted-foreground">
                      Let's take a guided tour to help you get started with long strangle options analysis.
                    </p>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tutorialModules.map((module, index) => (
                  <Card key={module.id} className="p-4 cursor-pointer hover:shadow-md transition-shadow">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 rounded-full bg-blue-500/10 mt-1">
                        {module.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{module.title}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {module.estimatedTime} min
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {module.description}
                        </p>
                        <Button
                          onClick={() => handleStartTutorial(index)}
                          size="sm"
                          className="w-full"
                        >
                          Start Module
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={handleSkipTutorial}>
                  {localStorage.getItem('tutorial-module-0-completed') ? 'Finish Tutorial' : 'Skip Tutorial'}
                </Button>
                {!localStorage.getItem('tutorial-module-0-completed') ? (
                  <Button onClick={() => handleStartTutorial(0)}>
                    Start First Module
                  </Button>
                ) : (
                  <div className="space-x-2">
                    {tutorialModules.map((_, index) => {
                      const isCompleted = localStorage.getItem(`tutorial-module-${index}-completed`) === 'true';
                      const isNext = index > 0 && localStorage.getItem(`tutorial-module-${index - 1}-completed`) === 'true' && !isCompleted;
                      
                      if (isNext) {
                        return (
                          <Button key={index} onClick={() => handleStartTutorial(index)}>
                            Continue to Lesson {index + 1}
                          </Button>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{Math.round(getCurrentProgress())}% Complete</span>
                </div>
                <Progress value={getCurrentProgress()} className="h-2" />
              </div>

              {/* Current Step */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">
                    Module {currentModule + 1} of {tutorialModules.length}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {tutorialModules[currentModule].title}
                  </span>
                </div>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-3">
                    {tutorialModules[currentModule].steps[currentStep].title}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {tutorialModules[currentModule].steps[currentStep].content}
                  </p>
                  
                  {tutorialModules[currentModule].steps[currentStep].actionText && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <div className="flex items-center space-x-2">
                        <div className="p-1 rounded-full bg-blue-500/10">
                          <Target className="h-3 w-3 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-blue-900">
                          Action Required:
                        </span>
                      </div>
                      <p className="text-sm text-blue-800 mt-1">
                        {tutorialModules[currentModule].steps[currentStep].actionText}
                      </p>
                    </div>
                  )}
                </Card>
              </div>

              {/* Navigation */}
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={handlePreviousStep}
                  disabled={currentModule === 0 && currentStep === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                
                <div className="flex space-x-2">
                  <Button variant="ghost" onClick={handleSkipTutorial}>
                    Skip Tutorial
                  </Button>
                  <Button onClick={handleNextStep}>
                    {currentModule === tutorialModules.length - 1 && 
                     currentStep === tutorialModules[currentModule].steps.length - 1
                      ? 'Complete Tutorial'
                      : 'Next'
                    }
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
  );
}