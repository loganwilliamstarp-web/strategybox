import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBatchedQuery } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Bell, Plus, Trash2, TrendingUp, TrendingDown, Target, Shield, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PriceAlert, TickerWithPosition } from "@shared/schema";

const createAlertSchema = z.object({
  tickerId: z.string().min(1, "Please select a ticker"),
  alertType: z.enum(['price_above', 'price_below', 'profit_target', 'stop_loss']),
  targetValue: z.number().positive("Target value must be positive"),
  notificationMethod: z.enum(['in_app', 'email', 'sms']).default('in_app'),
  message: z.string().optional(),
});

type CreateAlertForm = z.infer<typeof createAlertSchema>;

interface PriceAlertsProps {
  tickers: TickerWithPosition[];
}

export function PriceAlerts({ tickers }: PriceAlertsProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery<PriceAlert[]>({
    ...useBatchedQuery(['/api/alerts'])
  });

  const createAlertMutation = useMutation({
    mutationFn: (data: CreateAlertForm) => apiRequest('/api/alerts', {
      method: 'POST',
      data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      setIsCreateOpen(false);
      toast({
        title: "Alert Created",
        description: "Your price alert has been set up successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create alert. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: (alertId: string) => apiRequest(`/api/alerts/${alertId}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      toast({
        title: "Alert Deleted",
        description: "Price alert removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete alert. Please try again.",
        variant: "destructive",
      });
    },
  });

  const form = useForm<CreateAlertForm>({
    resolver: zodResolver(createAlertSchema),
    defaultValues: {
      tickerId: "",
      alertType: "price_above",
      targetValue: 0,
      notificationMethod: "in_app",
      message: "",
    },
  });

  const onSubmit = (data: CreateAlertForm) => {
    createAlertMutation.mutate(data);
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'price_above':
        return <TrendingUp className="h-4 w-4" />;
      case 'price_below':
        return <TrendingDown className="h-4 w-4" />;
      case 'profit_target':
        return <Target className="h-4 w-4" />;
      case 'stop_loss':
        return <Shield className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getAlertColor = (type: string, isTriggered: boolean) => {
    if (isTriggered) return "destructive";
    switch (type) {
      case 'profit_target':
        return "default";
      case 'stop_loss':
        return "secondary";
      default:
        return "outline";
    }
  };

  const formatAlertType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getTickerSymbol = (tickerId: string) => {
    const ticker = tickers.find(t => t.id === tickerId);
    return ticker?.symbol || 'Unknown';
  };

  return (
    <Card data-testid="card-price-alerts">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Price Alerts
          </CardTitle>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-alert">
                <Plus className="h-4 w-4 mr-2" />
                Add Alert
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-create-alert">
              <DialogHeader>
                <DialogTitle>Create Price Alert</DialogTitle>
                <DialogDescription>
                  Set up notifications for price movements and position targets.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="tickerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ticker</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-ticker">
                              <SelectValue placeholder="Select a ticker" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tickers.map((ticker) => (
                              <SelectItem 
                                key={ticker.id} 
                                value={ticker.id}
                                data-testid={`option-ticker-${ticker.symbol}`}
                              >
                                {ticker.symbol} - ${ticker.currentPrice}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="alertType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alert Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-alert-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="price_above" data-testid="option-price-above">
                              Price Above
                            </SelectItem>
                            <SelectItem value="price_below" data-testid="option-price-below">
                              Price Below
                            </SelectItem>
                            <SelectItem value="profit_target" data-testid="option-profit-target">
                              Profit Target
                            </SelectItem>
                            <SelectItem value="stop_loss" data-testid="option-stop-loss">
                              Stop Loss
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="targetValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Value ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            data-testid="input-target-value"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notificationMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notification Method</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-notification-method">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="in_app" data-testid="option-in-app">
                              In-App Notification
                            </SelectItem>
                            <SelectItem value="email" data-testid="option-email">
                              Email
                            </SelectItem>
                            <SelectItem value="sms" data-testid="option-sms">
                              SMS
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Message (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Custom alert message..."
                            data-testid="input-custom-message"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateOpen(false)}
                      data-testid="button-cancel-alert"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createAlertMutation.isPending}
                      data-testid="button-submit-alert"
                    >
                      {createAlertMutation.isPending ? "Creating..." : "Create Alert"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="text-center py-8" data-testid="alerts-loading">
            <Bell className="h-8 w-8 animate-pulse mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Loading alerts...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-8" data-testid="no-alerts">
            <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 mb-4">No price alerts set up yet</p>
            <p className="text-sm text-gray-500">
              Create alerts to get notified when prices hit your targets
            </p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="alerts-list">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                data-testid={`alert-item-${alert.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {getAlertIcon(alert.alertType)}
                    <Badge variant={getAlertColor(alert.alertType, alert.isTriggered)}>
                      {formatAlertType(alert.alertType)}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium" data-testid={`text-ticker-${alert.id}`}>
                        {getTickerSymbol(alert.tickerId)}
                      </span>
                      <span className="text-gray-600" data-testid={`text-target-${alert.id}`}>
                        ${alert.targetValue}
                      </span>
                    </div>
                    {alert.message && (
                      <p className="text-sm text-gray-500 mt-1" data-testid={`text-message-${alert.id}`}>
                        {alert.message}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {alert.notificationMethod}
                      </Badge>
                      {alert.isTriggered && (
                        <Badge variant="destructive" className="text-xs">
                          Triggered
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteAlertMutation.mutate(alert.id)}
                  disabled={deleteAlertMutation.isPending}
                  data-testid={`button-delete-${alert.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}