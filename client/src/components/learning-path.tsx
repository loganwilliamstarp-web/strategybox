import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  BookOpen, 
  Trophy, 
  Star, 
  CheckCircle, 
  Lock, 
  Play,
  Target,
  TrendingUp,
  Shield,
  Calculator
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LearningModule {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedTime: string;
  points: number;
  prerequisites: string[];
  content: {
    theory: string;
    examples: string[];
    keyPoints: string[];
  };
  quiz: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
}

const learningModules: LearningModule[] = [
  {
    id: "options-basics",
    title: "Options Trading Fundamentals",
    description: "Learn the basic concepts of options, calls, puts, and how they work",
    icon: BookOpen,
    difficulty: "Beginner",
    estimatedTime: "15 min",
    points: 100,
    prerequisites: [],
    content: {
      theory: "Options are financial contracts that give you the right (but not the obligation) to buy or sell an asset at a specific price before a certain date. There are two main types: calls (right to buy) and puts (right to sell).",
      examples: [
        "Call Option: You buy the right to purchase AAPL stock at $150 by March 15th",
        "Put Option: You buy the right to sell TSLA stock at $200 by April 20th"
      ],
      keyPoints: [
        "Options expire on specific dates",
        "You pay a premium to buy an option",
        "Strike price is the predetermined price",
        "You can exercise or let options expire"
      ]
    },
    quiz: [
      {
        question: "What gives you the right to buy a stock at a specific price?",
        options: ["Put Option", "Call Option", "Stock", "Bond"],
        correctAnswer: 1,
        explanation: "A call option gives you the right to buy a stock at the strike price."
      },
      {
        question: "What do you pay to purchase an option?",
        options: ["Strike Price", "Premium", "Commission", "Spread"],
        correctAnswer: 1,
        explanation: "The premium is the cost you pay upfront to purchase an option contract."
      }
    ]
  },
  {
    id: "long-strangle",
    title: "Long Strangle Strategy",
    description: "Master the long strangle strategy for high volatility scenarios",
    icon: Target,
    difficulty: "Intermediate",
    estimatedTime: "20 min",
    points: 150,
    prerequisites: ["options-basics"],
    content: {
      theory: "A long strangle involves buying both a call and put option with different strike prices but the same expiration date. This strategy profits from large price movements in either direction.",
      examples: [
        "Buy AAPL $190 Call + Buy AAPL $170 Put (both expiring March 15th)",
        "Profit if AAPL moves below $170 or above $190 (minus premiums paid)"
      ],
      keyPoints: [
        "Requires significant price movement to be profitable",
        "Maximum loss is the total premium paid",
        "Best used when expecting high volatility",
        "Two breakeven points: one above call strike, one below put strike"
      ]
    },
    quiz: [
      {
        question: "In a long strangle, what do you buy?",
        options: ["Only calls", "Only puts", "Both calls and puts", "Neither"],
        correctAnswer: 2,
        explanation: "A long strangle requires buying both a call and a put option."
      },
      {
        question: "When is a long strangle most profitable?",
        options: ["Low volatility", "High volatility", "Sideways movement", "Never"],
        correctAnswer: 1,
        explanation: "Long strangles profit from high volatility and significant price movements in either direction."
      }
    ]
  },
  {
    id: "implied-volatility",
    title: "Understanding Implied Volatility",
    description: "Learn how IV affects option pricing and trading decisions",
    icon: TrendingUp,
    difficulty: "Intermediate",
    estimatedTime: "25 min",
    points: 200,
    prerequisites: ["options-basics"],
    content: {
      theory: "Implied Volatility (IV) represents the market's expectation of future price movement. Higher IV means more expensive options, while lower IV means cheaper options. IV percentile shows where current IV ranks compared to the past year.",
      examples: [
        "AAPL IV at 25% (50th percentile) = average volatility",
        "TSLA IV at 45% (90th percentile) = very high volatility"
      ],
      keyPoints: [
        "IV affects option prices significantly",
        "Buy options when IV is low, sell when IV is high",
        "IV percentile provides historical context",
        "Earnings and events typically increase IV"
      ]
    },
    quiz: [
      {
        question: "What does high implied volatility indicate?",
        options: ["Cheap options", "Expensive options", "No price movement", "Guaranteed profit"],
        correctAnswer: 1,
        explanation: "High implied volatility typically makes options more expensive due to increased uncertainty."
      },
      {
        question: "What does IV percentile tell you?",
        options: ["Future stock price", "Historical ranking of current IV", "Option strike price", "Expiration date"],
        correctAnswer: 1,
        explanation: "IV percentile shows where current implied volatility ranks compared to the past 52 weeks."
      }
    ]
  },
  {
    id: "risk-management",
    title: "Risk Management & Position Sizing",
    description: "Essential risk management techniques for options trading",
    icon: Shield,
    difficulty: "Advanced",
    estimatedTime: "30 min",
    points: 250,
    prerequisites: ["long-strangle", "implied-volatility"],
    content: {
      theory: "Proper risk management is crucial for long-term success. This includes position sizing, stop-loss strategies, portfolio diversification, and understanding maximum loss scenarios.",
      examples: [
        "Risk only 2-5% of portfolio per trade",
        "Set stop-loss at 50% of premium paid",
        "Diversify across different stocks and sectors"
      ],
      keyPoints: [
        "Never risk more than you can afford to lose",
        "Size positions based on probability of success",
        "Have exit strategies before entering trades",
        "Monitor time decay and adjust positions accordingly"
      ]
    },
    quiz: [
      {
        question: "What's a recommended maximum risk per trade?",
        options: ["1-2%", "2-5%", "10-15%", "25-30%"],
        correctAnswer: 1,
        explanation: "Most professionals recommend risking only 2-5% of your portfolio per individual trade."
      },
      {
        question: "When should you typically close a losing options position?",
        options: ["At expiration", "50% loss", "25% loss", "Never"],
        correctAnswer: 1,
        explanation: "Many traders close positions at 50% loss to preserve capital for future opportunities."
      }
    ]
  },
  {
    id: "advanced-calculations",
    title: "Options Pricing & Greeks",
    description: "Deep dive into options pricing models and the Greeks",
    icon: Calculator,
    difficulty: "Advanced",
    estimatedTime: "35 min",
    points: 300,
    prerequisites: ["implied-volatility", "risk-management"],
    content: {
      theory: "The Greeks (Delta, Gamma, Theta, Vega) measure how option prices change with various factors. Understanding these helps predict how your positions will behave under different market conditions.",
      examples: [
        "Delta 0.5 = option price moves $0.50 for every $1 stock move",
        "Theta -0.10 = option loses $0.10 value per day",
        "Vega 0.20 = option price changes $0.20 per 1% IV change"
      ],
      keyPoints: [
        "Delta measures price sensitivity to stock movement",
        "Theta measures time decay",
        "Vega measures sensitivity to volatility changes",
        "Gamma measures how Delta changes"
      ]
    },
    quiz: [
      {
        question: "Which Greek measures time decay?",
        options: ["Delta", "Gamma", "Theta", "Vega"],
        correctAnswer: 2,
        explanation: "Theta measures how much an option's price decreases as time passes (time decay)."
      },
      {
        question: "If an option has a Vega of 0.15, what happens if IV increases by 2%?",
        options: ["Price decreases $0.30", "Price increases $0.30", "No change", "Price doubles"],
        correctAnswer: 1,
        explanation: "Vega 0.15 means the option price increases $0.15 per 1% IV increase, so 2% = $0.30 increase."
      }
    ]
  }
];

interface LearningPathProps {
  className?: string;
}

export function LearningPath({ className }: LearningPathProps) {
  const [completedModules, setCompletedModules] = useState<string[]>([]);
  const [currentModule, setCurrentModule] = useState<LearningModule | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const { toast } = useToast();

  // Load progress from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('options-learning-progress');
    if (saved) {
      const progress = JSON.parse(saved);
      setCompletedModules(progress.completed || []);
      setTotalPoints(progress.points || 0);
    }
  }, []);

  // Save progress to localStorage
  const saveProgress = (completed: string[], points: number) => {
    localStorage.setItem('options-learning-progress', JSON.stringify({
      completed,
      points,
      lastUpdated: new Date().toISOString()
    }));
  };

  const isModuleUnlocked = (module: LearningModule) => {
    return module.prerequisites.every(prereq => completedModules.includes(prereq));
  };

  const startModule = (module: LearningModule) => {
    setCurrentModule(module);
    setShowQuiz(false);
    setQuizAnswers([]);
    setQuizScore(null);
  };

  const startQuiz = () => {
    setShowQuiz(true);
    setQuizAnswers(new Array(currentModule?.quiz.length || 0).fill(-1));
  };

  const handleQuizAnswer = (questionIndex: number, answerIndex: number) => {
    const newAnswers = [...quizAnswers];
    newAnswers[questionIndex] = answerIndex;
    setQuizAnswers(newAnswers);
  };

  const submitQuiz = () => {
    if (!currentModule) return;

    const correctAnswers = quizAnswers.filter((answer, index) => 
      answer === currentModule.quiz[index].correctAnswer
    ).length;
    
    const score = Math.round((correctAnswers / currentModule.quiz.length) * 100);
    setQuizScore(score);

    if (score >= 70) {
      const newCompleted = [...completedModules, currentModule.id];
      const newPoints = totalPoints + currentModule.points;
      
      setCompletedModules(newCompleted);
      setTotalPoints(newPoints);
      saveProgress(newCompleted, newPoints);

      toast({
        title: "Module completed!",
        description: `You earned ${currentModule.points} points! Total: ${newPoints}`,
      });
    } else {
      toast({
        title: "Try again",
        description: "You need 70% or higher to complete the module.",
        variant: "destructive",
      });
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return 'bg-green-100 text-green-800';
      case 'Intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'Advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const overallProgress = (completedModules.length / learningModules.length) * 100;

  return (
    <div className={className}>
      <Card className="p-6" data-testid="learning-path-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Options Trading Learning Path
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Master options trading through interactive lessons and quizzes
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="font-semibold text-foreground">{totalPoints} pts</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {completedModules.length}/{learningModules.length} modules
            </div>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-foreground">Overall Progress</span>
            <span className="text-sm text-muted-foreground">{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Learning Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {learningModules.map((module) => {
            const isCompleted = completedModules.includes(module.id);
            const isUnlocked = isModuleUnlocked(module);
            const IconComponent = module.icon;

            return (
              <Card 
                key={module.id} 
                className={`p-4 relative ${
                  isCompleted ? 'border-green-200 bg-green-50' : 
                  isUnlocked ? 'border-border hover:border-primary cursor-pointer' :
                  'border-gray-200 bg-gray-50 opacity-60'
                }`}
                data-testid={`module-card-${module.id}`}
              >
                {isCompleted && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                )}
                {!isUnlocked && (
                  <div className="absolute top-2 right-2">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                )}

                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${
                    isCompleted ? 'bg-green-100' : 
                    isUnlocked ? 'bg-primary/10' : 'bg-gray-100'
                  }`}>
                    <IconComponent className={`h-4 w-4 ${
                      isCompleted ? 'text-green-600' :
                      isUnlocked ? 'text-primary' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground text-sm mb-1">
                      {module.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-2">
                      {module.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <Badge className={`text-xs ${getDifficultyColor(module.difficulty)}`}>
                    {module.difficulty}
                  </Badge>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{module.estimatedTime}</span>
                    <span>•</span>
                    <span>{module.points} pts</span>
                  </div>
                </div>

                {module.prerequisites.length > 0 && (
                  <div className="text-xs text-muted-foreground mb-3">
                    Requires: {module.prerequisites.map(id => 
                      learningModules.find(m => m.id === id)?.title
                    ).join(', ')}
                  </div>
                )}

                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant={isCompleted ? "secondary" : "default"}
                      size="sm" 
                      className="w-full"
                      disabled={!isUnlocked}
                      onClick={() => startModule(module)}
                      data-testid={`button-start-${module.id}`}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      {isCompleted ? 'Review' : 'Start'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <IconComponent className="h-5 w-5" />
                        {currentModule?.title}
                      </DialogTitle>
                      <DialogDescription>
                        {currentModule?.description}
                      </DialogDescription>
                    </DialogHeader>

                    {currentModule && !showQuiz && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-2">Theory</h4>
                          <p className="text-sm text-muted-foreground">
                            {currentModule.content.theory}
                          </p>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Examples</h4>
                          <ul className="space-y-1">
                            {currentModule.content.examples.map((example, index) => (
                              <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                                <span className="text-primary">•</span>
                                {example}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Key Points</h4>
                          <ul className="space-y-1">
                            {currentModule.content.keyPoints.map((point, index) => (
                              <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                                <Star className="h-3 w-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <Button onClick={startQuiz} className="w-full" data-testid="button-start-quiz">
                          Take Quiz ({currentModule.quiz.length} questions)
                        </Button>
                      </div>
                    )}

                    {currentModule && showQuiz && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium">Quiz</h4>
                          <Badge variant="secondary">
                            {quizAnswers.filter(a => a !== -1).length}/{currentModule.quiz.length}
                          </Badge>
                        </div>

                        {currentModule.quiz.map((question, qIndex) => (
                          <div key={qIndex} className="border rounded-lg p-4">
                            <h5 className="font-medium mb-3">
                              {qIndex + 1}. {question.question}
                            </h5>
                            <div className="space-y-2">
                              {question.options.map((option, oIndex) => (
                                <button
                                  key={oIndex}
                                  onClick={() => handleQuizAnswer(qIndex, oIndex)}
                                  className={`w-full text-left p-2 rounded border ${
                                    quizAnswers[qIndex] === oIndex 
                                      ? 'border-primary bg-primary/10' 
                                      : 'border-border hover:border-primary/50'
                                  }`}
                                  data-testid={`quiz-option-${qIndex}-${oIndex}`}
                                >
                                  {String.fromCharCode(65 + oIndex)}. {option}
                                </button>
                              ))}
                            </div>
                            {quizScore !== null && (
                              <div className={`mt-3 p-2 rounded ${
                                quizAnswers[qIndex] === question.correctAnswer 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                <p className="text-sm font-medium">
                                  {quizAnswers[qIndex] === question.correctAnswer ? '✓ Correct' : '✗ Incorrect'}
                                </p>
                                <p className="text-xs mt-1">{question.explanation}</p>
                              </div>
                            )}
                          </div>
                        ))}

                        {quizScore === null ? (
                          <Button 
                            onClick={submitQuiz} 
                            disabled={quizAnswers.includes(-1)}
                            className="w-full"
                            data-testid="button-submit-quiz"
                          >
                            Submit Quiz
                          </Button>
                        ) : (
                          <div className="text-center">
                            <div className={`text-lg font-bold ${
                              quizScore >= 70 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              Score: {quizScore}%
                            </div>
                            {quizScore >= 70 ? (
                              <p className="text-sm text-green-600 mt-1">
                                Congratulations! Module completed.
                              </p>
                            ) : (
                              <p className="text-sm text-red-600 mt-1">
                                Need 70% to pass. Review the material and try again.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </Card>
            );
          })}
        </div>

        {/* Achievement Section */}
        {completedModules.length > 0 && (
          <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-5 w-5 text-yellow-600" />
              <h3 className="font-semibold text-yellow-800">Achievements</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {completedModules.length >= 1 && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                  First Steps 🎯
                </Badge>
              )}
              {completedModules.length >= 3 && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                  Learning Streak 🔥
                </Badge>
              )}
              {completedModules.length === learningModules.length && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                  Options Master 👑
                </Badge>
              )}
              {totalPoints >= 500 && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  Point Hunter 💎
                </Badge>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}