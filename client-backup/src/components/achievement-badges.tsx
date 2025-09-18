import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Trophy, Star, Target, TrendingUp, Calendar, BookOpen, Zap, Award, Medal, Crown, Shield, Flame } from "lucide-react";

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'trading' | 'learning' | 'engagement' | 'milestones';
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  requirement: number;
  currentProgress: number;
  isUnlocked: boolean;
  unlockedAt?: Date;
  points: number;
}

interface AchievementBadgesProps {
  tickers: Array<{
    symbol: string;
    position: {
      daysToExpiry: number;
      impliedVolatility: number;
      ivPercentile: number;
      maxLoss: number;
    };
  }>;
}

export function AchievementBadges({ tickers }: AchievementBadgesProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [totalPoints, setTotalPoints] = useState(0);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);

  // Initialize achievements and track progress
  useEffect(() => {
    const userStats = getUserStats();
    const achievementList = generateAchievements(userStats);
    setAchievements(achievementList);
    
    const points = achievementList
      .filter(a => a.isUnlocked)
      .reduce((sum, a) => sum + a.points, 0);
    setTotalPoints(points);
    
    // Check for newly unlocked achievements
    const previouslyUnlocked = JSON.parse(localStorage.getItem('unlocked-achievements') || '[]');
    const currentlyUnlocked = achievementList.filter(a => a.isUnlocked).map(a => a.id);
    const newUnlocks = currentlyUnlocked.filter(id => !previouslyUnlocked.includes(id));
    
    if (newUnlocks.length > 0) {
      const newAchievements = achievementList.filter(a => newUnlocks.includes(a.id));
      setNewlyUnlocked(newAchievements);
      localStorage.setItem('unlocked-achievements', JSON.stringify(currentlyUnlocked));
    }
  }, [tickers]);

  const getUserStats = () => {
    // Get stats from localStorage and current tickers
    const loginStreak = parseInt(localStorage.getItem('login-streak') || '1');
    const totalLogins = parseInt(localStorage.getItem('total-logins') || '1');
    const tutorialCompleted = localStorage.getItem('tutorial-completed') === 'true';
    const learningProgress = JSON.parse(localStorage.getItem('learning-progress') || '{}');
    const exportCount = parseInt(localStorage.getItem('export-count') || '0');
    const searchCount = parseInt(localStorage.getItem('search-count') || '0');
    
    // Calculate portfolio stats
    const totalPositions = tickers.length;
    const highIVPositions = tickers.filter(t => t.position.ivPercentile > 75).length;
    const diversification = new Set(tickers.map(t => t.symbol.charAt(0))).size; // Rough sector diversity
    const totalRisk = tickers.reduce((sum, t) => sum + t.position.maxLoss, 0);
    const avgDTE = tickers.length > 0 ? tickers.reduce((sum, t) => sum + t.position.daysToExpiry, 0) / tickers.length : 0;
    
    return {
      loginStreak,
      totalLogins,
      tutorialCompleted,
      learningModules: Object.keys(learningProgress).length,
      exportCount,
      searchCount,
      totalPositions,
      highIVPositions,
      diversification,
      totalRisk,
      avgDTE,
      accountAge: Math.floor((Date.now() - parseInt(localStorage.getItem('first-login') || Date.now().toString())) / (1000 * 60 * 60 * 24))
    };
  };

  const generateAchievements = (stats: any): Achievement[] => {
    return [
      // Trading Achievements
      {
        id: 'first-position',
        title: 'First Steps',
        description: 'Add your first ticker to start tracking long strangle positions',
        icon: <Target className="h-4 w-4" />,
        category: 'trading',
        tier: 'bronze',
        requirement: 1,
        currentProgress: stats.totalPositions,
        isUnlocked: stats.totalPositions >= 1,
        points: 50
      },
      {
        id: 'portfolio-builder',
        title: 'Portfolio Builder',
        description: 'Track 5 different long strangle positions simultaneously',
        icon: <TrendingUp className="h-4 w-4" />,
        category: 'trading',
        tier: 'silver',
        requirement: 5,
        currentProgress: stats.totalPositions,
        isUnlocked: stats.totalPositions >= 5,
        points: 150
      },
      {
        id: 'diversification-master',
        title: 'Diversification Master',
        description: 'Hold positions across 8+ different market sectors',
        icon: <Shield className="h-4 w-4" />,
        category: 'trading',
        tier: 'gold',
        requirement: 8,
        currentProgress: stats.diversification,
        isUnlocked: stats.diversification >= 8,
        points: 300
      },
      {
        id: 'high-iv-hunter',
        title: 'Volatility Hunter',
        description: 'Maintain 3+ positions with IV percentile above 75%',
        icon: <Zap className="h-4 w-4" />,
        category: 'trading',
        tier: 'gold',
        requirement: 3,
        currentProgress: stats.highIVPositions,
        isUnlocked: stats.highIVPositions >= 3,
        points: 250
      },
      {
        id: 'risk-manager',
        title: 'Risk Manager',
        description: 'Keep average days to expiry above 30 days across all positions',
        icon: <Calendar className="h-4 w-4" />,
        category: 'trading',
        tier: 'silver',
        requirement: 30,
        currentProgress: Math.round(stats.avgDTE),
        isUnlocked: stats.avgDTE >= 30,
        points: 200
      },

      // Learning Achievements
      {
        id: 'tutorial-graduate',
        title: 'Tutorial Graduate',
        description: 'Complete the interactive tutorial to learn platform basics',
        icon: <BookOpen className="h-4 w-4" />,
        category: 'learning',
        tier: 'bronze',
        requirement: 1,
        currentProgress: stats.tutorialCompleted ? 1 : 0,
        isUnlocked: stats.tutorialCompleted,
        points: 100
      },
      {
        id: 'knowledge-seeker',
        title: 'Knowledge Seeker',
        description: 'Complete 3 learning modules in the education section',
        icon: <Star className="h-4 w-4" />,
        category: 'learning',
        tier: 'silver',
        requirement: 3,
        currentProgress: stats.learningModules,
        isUnlocked: stats.learningModules >= 3,
        points: 200
      },
      {
        id: 'options-scholar',
        title: 'Options Scholar',
        description: 'Master all 5 learning modules with perfect quiz scores',
        icon: <Crown className="h-4 w-4" />,
        category: 'learning',
        tier: 'platinum',
        requirement: 5,
        currentProgress: stats.learningModules,
        isUnlocked: stats.learningModules >= 5,
        points: 500
      },

      // Engagement Achievements
      {
        id: 'daily-trader',
        title: 'Daily Trader',
        description: 'Log in for 7 consecutive days to track your positions',
        icon: <Flame className="h-4 w-4" />,
        category: 'engagement',
        tier: 'bronze',
        requirement: 7,
        currentProgress: stats.loginStreak,
        isUnlocked: stats.loginStreak >= 7,
        points: 150
      },
      {
        id: 'platform-explorer',
        title: 'Platform Explorer',
        description: 'Search for 10 different tickers to analyze opportunities',
        icon: <Target className="h-4 w-4" />,
        category: 'engagement',
        tier: 'silver',
        requirement: 10,
        currentProgress: stats.searchCount,
        isUnlocked: stats.searchCount >= 10,
        points: 100
      },
      {
        id: 'data-exporter',
        title: 'Data Analyst',
        description: 'Export trading insights 5 times to analyze your performance',
        icon: <TrendingUp className="h-4 w-4" />,
        category: 'engagement',
        tier: 'silver',
        requirement: 5,
        currentProgress: stats.exportCount,
        isUnlocked: stats.exportCount >= 5,
        points: 125
      },

      // Milestone Achievements
      {
        id: 'veteran-trader',
        title: 'Veteran Trader',
        description: 'Use the platform for 30 days to build trading expertise',
        icon: <Medal className="h-4 w-4" />,
        category: 'milestones',
        tier: 'gold',
        requirement: 30,
        currentProgress: stats.accountAge,
        isUnlocked: stats.accountAge >= 30,
        points: 400
      },
      {
        id: 'loyalty-badge',
        title: 'Platform Loyalty',
        description: 'Log in 50 times to show commitment to learning',
        icon: <Award className="h-4 w-4" />,
        category: 'milestones',
        tier: 'platinum',
        requirement: 50,
        currentProgress: stats.totalLogins,
        isUnlocked: stats.totalLogins >= 50,
        points: 600
      }
    ];
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'bronze': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'silver': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'gold': return 'bg-yellow-100 text-yellow-800 border-yellow-400';
      case 'platinum': return 'bg-purple-100 text-purple-800 border-purple-400';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getProgressColor = (progress: number, requirement: number) => {
    const percentage = (progress / requirement) * 100;
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-yellow-500';
    if (percentage >= 50) return 'bg-blue-500';
    return 'bg-gray-400';
  };

  const filteredAchievements = selectedCategory === 'all' 
    ? achievements 
    : achievements.filter(a => a.category === selectedCategory);

  const categoryStats = {
    all: achievements.length,
    trading: achievements.filter(a => a.category === 'trading').length,
    learning: achievements.filter(a => a.category === 'learning').length,
    engagement: achievements.filter(a => a.category === 'engagement').length,
    milestones: achievements.filter(a => a.category === 'milestones').length
  };

  const unlockedCount = achievements.filter(a => a.isUnlocked).length;

  return (
    <Card className="p-6" data-testid="card-achievements">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-full bg-yellow-500/10">
              <Trophy className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Achievement Badges</h3>
              <p className="text-sm text-muted-foreground">Track your trading journey progress</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-yellow-600">{totalPoints}</div>
            <div className="text-sm text-muted-foreground">Points Earned</div>
          </div>
        </div>

        {/* Progress Overview */}
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-muted-foreground">
              {unlockedCount} of {achievements.length} unlocked
            </span>
          </div>
          <Progress value={(unlockedCount / achievements.length) * 100} className="h-2" />
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All', icon: <Trophy className="h-3 w-3" /> },
            { key: 'trading', label: 'Trading', icon: <TrendingUp className="h-3 w-3" /> },
            { key: 'learning', label: 'Learning', icon: <BookOpen className="h-3 w-3" /> },
            { key: 'engagement', label: 'Engagement', icon: <Target className="h-3 w-3" /> },
            { key: 'milestones', label: 'Milestones', icon: <Medal className="h-3 w-3" /> }
          ].map((category) => (
            <Button
              key={category.key}
              variant={selectedCategory === category.key ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category.key)}
              className="h-8"
            >
              {category.icon}
              <span className="ml-1">{category.label}</span>
              <Badge variant="secondary" className="ml-2 text-xs">
                {categoryStats[category.key as keyof typeof categoryStats]}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Achievement Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAchievements.map((achievement) => (
            <Dialog key={achievement.id}>
              <DialogTrigger asChild>
                <Card className={`p-4 cursor-pointer hover:shadow-md transition-all ${
                  achievement.isUnlocked ? 'ring-2 ring-green-200 bg-green-50/30' : 'opacity-75'
                }`}>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className={`p-2 rounded-full ${
                        achievement.isUnlocked ? 'bg-green-500/10' : 'bg-gray-500/10'
                      }`}>
                        <div className={achievement.isUnlocked ? 'text-green-600' : 'text-gray-500'}>
                          {achievement.icon}
                        </div>
                      </div>
                      <Badge className={`text-xs ${getTierColor(achievement.tier)}`}>
                        {achievement.tier}
                      </Badge>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-sm">{achievement.title}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {achievement.description}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Progress</span>
                        <span>{Math.min(achievement.currentProgress, achievement.requirement)}/{achievement.requirement}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${getProgressColor(achievement.currentProgress, achievement.requirement)}`}
                          style={{ 
                            width: `${Math.min((achievement.currentProgress / achievement.requirement) * 100, 100)}%` 
                          }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-yellow-600">
                        {achievement.points} pts
                      </span>
                      {achievement.isUnlocked && (
                        <Badge variant="default" className="text-xs bg-green-500">
                          ✓ Unlocked
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              </DialogTrigger>
              
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center space-x-2">
                    <div className={`p-2 rounded-full ${
                      achievement.isUnlocked ? 'bg-green-500/10' : 'bg-gray-500/10'
                    }`}>
                      <div className={achievement.isUnlocked ? 'text-green-600' : 'text-gray-500'}>
                        {achievement.icon}
                      </div>
                    </div>
                    <span>{achievement.title}</span>
                  </DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Badge className={getTierColor(achievement.tier)}>
                      {achievement.tier.toUpperCase()}
                    </Badge>
                    <Badge variant="secondary">{achievement.points} points</Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {achievement.description}
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress:</span>
                      <span className="font-medium">
                        {Math.min(achievement.currentProgress, achievement.requirement)} / {achievement.requirement}
                      </span>
                    </div>
                    <Progress 
                      value={(achievement.currentProgress / achievement.requirement) * 100} 
                      className="h-2"
                    />
                  </div>
                  
                  {achievement.isUnlocked ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Trophy className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-900">
                          Achievement Unlocked!
                        </span>
                      </div>
                      {achievement.unlockedAt && (
                        <p className="text-xs text-green-700 mt-1">
                          Earned on {achievement.unlockedAt.toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Target className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">
                          Keep going!
                        </span>
                      </div>
                      <p className="text-xs text-blue-700 mt-1">
                        {achievement.requirement - achievement.currentProgress} more to unlock this achievement
                      </p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          ))}
        </div>

        {/* Newly Unlocked Notification */}
        {newlyUnlocked.length > 0 && (
          <div className="fixed bottom-4 right-4 space-y-2 z-50">
            {newlyUnlocked.map((achievement) => (
              <Card key={achievement.id} className="p-4 bg-green-50 border-green-200 shadow-lg">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-full bg-green-500/10">
                    <Trophy className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-green-900">
                      Achievement Unlocked!
                    </div>
                    <div className="text-xs text-green-700">
                      {achievement.title} (+{achievement.points} pts)
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewlyUnlocked(prev => prev.filter(a => a.id !== achievement.id))}
                    className="h-6 w-6 p-0"
                  >
                    ×
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}