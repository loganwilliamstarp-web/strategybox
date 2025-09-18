import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Brain, TrendingUp, TrendingDown, RefreshCw, X, Target, Shield, RotateCcw, Pause, AlertCircle, CheckCircle, Clock, DollarSign } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ExitRecommendation } from "@shared/schema";

export function ExitRecommendations() {
  const [selectedRec, setSelectedRec] = useState<ExitRecommendation | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recommendations = [], isLoading, refetch } = useQuery<ExitRecommendation[]>({
    queryKey: ['/api/recommendations'],
  });

  const generateRecommendationsMutation = useMutation({
    mutationFn: () => apiRequest('/api/recommendations/generate', {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recommendations'] });
      toast({
        title: "Recommendations Generated",
        description: "New exit recommendations have been generated based on current market conditions.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate recommendations. Please try again.",
        variant: "destructive",
      });
    },
  });

  const dismissRecommendationMutation = useMutation({
    mutationFn: (recId: string) => apiRequest(`/api/recommendations/${recId}/dismiss`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recommendations'] });
      setSelectedRec(null);
      toast({
        title: "Recommendation Dismissed",
        description: "The recommendation has been marked as read.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to dismiss recommendation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'take_profit':
        return <TrendingUp className="h-4 w-4" />;
      case 'cut_loss':
        return <TrendingDown className="h-4 w-4" />;
      case 'roll_position':
        return <RotateCcw className="h-4 w-4" />;
      case 'hold':
        return <Pause className="h-4 w-4" />;
      default:
        return <Target className="h-4 w-4" />;
    }
  };

  const getRecommendationColor = (type: string) => {
    switch (type) {
      case 'take_profit':
        return "default";
      case 'cut_loss':
        return "destructive";
      case 'roll_position':
        return "secondary";
      case 'hold':
        return "outline";
      default:
        return "outline";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return "destructive";
      case 'high':
        return "default";
      case 'medium':
        return "secondary";
      case 'low':
        return "outline";
      default:
        return "outline";
    }
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high':
        return "destructive";
      case 'medium':
        return "default";
      case 'low':
        return "secondary";
      default:
        return "outline";
    }
  };

  const formatRecommendationType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${Math.abs(value).toFixed(0)}`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-green-600";
    if (confidence >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card data-testid="card-exit-recommendations">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Exit Recommendations
          </CardTitle>
          <Button
            onClick={() => generateRecommendationsMutation.mutate()}
            disabled={generateRecommendationsMutation.isPending}
            size="sm"
            data-testid="button-generate-recommendations"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${generateRecommendationsMutation.isPending ? 'animate-spin' : ''}`} />
            {generateRecommendationsMutation.isPending ? 'Analyzing...' : 'Analyze Positions'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="h-80 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8" data-testid="recommendations-loading">
            <Brain className="h-8 w-8 animate-pulse mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Loading recommendations...</p>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-8" data-testid="no-recommendations">
            <Target className="h-8 w-8 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 mb-4">No active recommendations</p>
            <p className="text-sm text-gray-500 mb-4">
              Generate AI-powered exit recommendations based on your current positions
            </p>
            <Button
              onClick={() => generateRecommendationsMutation.mutate()}
              disabled={generateRecommendationsMutation.isPending}
              data-testid="button-generate-first-recommendations"
            >
              <Brain className="h-4 w-4 mr-2" />
              Generate Recommendations
            </Button>
          </div>
        ) : (
          <div className="space-y-3" data-testid="recommendations-list">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setSelectedRec(rec)}
                data-testid={`recommendation-item-${rec.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getRecommendationIcon(rec.recommendationType)}
                    <Badge variant={getRecommendationColor(rec.recommendationType)}>
                      {formatRecommendationType(rec.recommendationType)}
                    </Badge>
                    <Badge variant={getPriorityColor(rec.priority)} className="text-xs">
                      {rec.priority.toUpperCase()}
                    </Badge>
                    <Badge variant={getRiskLevelColor(rec.riskLevel)} className="text-xs">
                      {rec.riskLevel.toUpperCase()} RISK
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className={`flex items-center gap-1 ${getConfidenceColor(rec.confidence)}`}>
                      <CheckCircle className="h-3 w-3" />
                      {rec.confidence}%
                    </div>
                    <Clock className="h-3 w-3" />
                    {rec.createdAt ? new Date(rec.createdAt).toLocaleDateString() : 'Unknown'}
                  </div>
                </div>
                
                <p className="text-sm text-gray-700 mb-2" data-testid={`text-reasoning-${rec.id}`}>
                  {rec.reasoning}
                </p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium" data-testid={`text-action-${rec.id}`}>
                      {rec.targetAction}
                    </span>
                    {rec.profitLossImpact !== null && (
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        <span 
                          className={rec.profitLossImpact >= 0 ? "text-green-600" : "text-red-600"}
                          data-testid={`text-impact-${rec.id}`}
                        >
                          {formatCurrency(rec.profitLossImpact)}
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissRecommendationMutation.mutate(rec.id);
                    }}
                    disabled={dismissRecommendationMutation.isPending}
                    data-testid={`button-dismiss-${rec.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detailed recommendation modal */}
        {selectedRec && (
          <Dialog open={!!selectedRec} onOpenChange={() => setSelectedRec(null)}>
            <DialogContent className="max-w-2xl" data-testid="dialog-recommendation-details">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {getRecommendationIcon(selectedRec.recommendationType)}
                  {formatRecommendationType(selectedRec.recommendationType)} Recommendation
                </DialogTitle>
                <DialogDescription>
                  AI-generated recommendation with {selectedRec.confidence}% confidence
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Priority Level</Label>
                    <Badge variant={getPriorityColor(selectedRec.priority)} className="w-fit">
                      {selectedRec.priority.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Risk Level</Label>
                    <Badge variant={getRiskLevelColor(selectedRec.riskLevel)} className="w-fit">
                      {selectedRec.riskLevel.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Analysis & Reasoning</Label>
                  <p className="text-sm text-gray-700 p-3 bg-gray-50 rounded-lg">
                    {selectedRec.reasoning}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Recommended Action</Label>
                  <p className="text-sm font-medium p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    {selectedRec.targetAction}
                  </p>
                </div>

                {selectedRec.profitLossImpact !== null && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Expected Impact</Label>
                    <div className={`flex items-center gap-2 p-3 rounded-lg ${
                      selectedRec.profitLossImpact >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                    }`}>
                      <DollarSign className="h-4 w-4" />
                      <span className={`font-medium ${selectedRec.profitLossImpact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(selectedRec.profitLossImpact)} estimated impact
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedRec(null)}
                    data-testid="button-close-details"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => dismissRecommendationMutation.mutate(selectedRec.id)}
                    disabled={dismissRecommendationMutation.isPending}
                    data-testid="button-dismiss-details"
                  >
                    {dismissRecommendationMutation.isPending ? 'Dismissing...' : 'Mark as Read'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={className}>{children}</label>;
}