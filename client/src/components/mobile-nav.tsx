import { useState } from 'react';
import { useCapacitor } from '@/hooks/useCapacitor';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Menu, Smartphone, TrendingUp, BarChart3, Bell, Settings } from 'lucide-react';
import { ImpactStyle } from '@capacitor/haptics';

interface MobileNavProps {
  currentTotalPnL?: number;
  activePositions?: number;
}

export function MobileNav({ currentTotalPnL = 0, activePositions = 0 }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isNative, triggerHaptics } = useCapacitor();

  const handleNavClick = async (action: string) => {
    if (isNative) {
      await triggerHaptics(ImpactStyle.Light);
    }
    setIsOpen(false);
    console.log(`Navigate to: ${action}`);
  };

  if (!isNative) {
    return null; // Only show on mobile devices
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white px-4 py-2 flex items-center justify-between shadow-lg">
      {/* Left: Menu button */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-white hover:bg-slate-800"
            onClick={() => triggerHaptics(ImpactStyle.Light)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-slate-900 text-white border-slate-700">
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 mb-6 pt-4">
              <Smartphone className="h-6 w-6 text-blue-400" />
              <span className="font-semibold text-lg">Options Trader</span>
            </div>
            
            <div className="space-y-2 flex-1">
              <Button
                variant="ghost"
                className="w-full justify-start text-white hover:bg-slate-800"
                onClick={() => handleNavClick('dashboard')}
              >
                <TrendingUp className="h-4 w-4 mr-3" />
                Dashboard
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-white hover:bg-slate-800"
                onClick={() => handleNavClick('positions')}
              >
                <BarChart3 className="h-4 w-4 mr-3" />
                My Positions
                <Badge variant="secondary" className="ml-auto">
                  {activePositions}
                </Badge>
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-white hover:bg-slate-800"
                onClick={() => handleNavClick('alerts')}
              >
                <Bell className="h-4 w-4 mr-3" />
                Price Alerts
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-white hover:bg-slate-800"
                onClick={() => handleNavClick('settings')}
              >
                <Settings className="h-4 w-4 mr-3" />
                Settings
              </Button>
            </div>

            <div className="mt-auto pb-4 pt-4 border-t border-slate-700">
              <div className="text-sm text-slate-400">Quick Stats</div>
              <div className="mt-2">
                <div className="text-xs text-slate-400">Total P&L</div>
                <div className={`text-lg font-semibold ${
                  currentTotalPnL >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {currentTotalPnL >= 0 ? '+' : ''}${currentTotalPnL.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Center: App title */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-blue-400" />
        <span className="font-semibold">Options Trader</span>
      </div>

      {/* Right: Quick stats */}
      <div className="text-right">
        <div className="text-xs text-slate-300">Positions</div>
        <div className="text-sm font-medium">{activePositions}</div>
      </div>
    </div>
  );
}

export default MobileNav;