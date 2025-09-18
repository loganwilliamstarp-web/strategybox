import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ExpirationSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function ExpirationSelector({ value, onValueChange, className = "" }: ExpirationSelectorProps) {
  // Generate next 8 Friday expirations
  const generateExpirations = () => {
    const expirations: { value: string; label: string; days: number }[] = [];
    const now = new Date();
    
    for (let i = 0; i < 8; i++) {
      const nextFriday = new Date(now);
      const daysUntilFriday = (5 - now.getDay() + 7) % 7;
      nextFriday.setDate(now.getDate() + daysUntilFriday + (i * 7));
      
      const days = Math.ceil((nextFriday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const dateString = nextFriday.toISOString().split('T')[0];
      const displayDate = nextFriday.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: nextFriday.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
      
      expirations.push({
        value: dateString,
        label: `${displayDate} (${days}d)`,
        days
      });
    }
    
    return expirations;
  };

  const expirations = generateExpirations();

  return (
    <div className={className} data-testid="expiration-selector">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id="expiration-select" className="w-full" data-testid="select-expiration">
          <SelectValue placeholder="Select expiration date" />
        </SelectTrigger>
        <SelectContent>
          {expirations.map((exp, index) => (
            <SelectItem key={exp.value} value={exp.value} data-testid={`expiration-${index}`}>
              <div className="flex justify-between items-center w-full">
                <span>{exp.label}</span>
                {index === 0 && <span className="text-xs text-blue-500 ml-2">Next</span>}
                {exp.days <= 7 && <span className="text-xs text-orange-500 ml-2">Weekly</span>}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}