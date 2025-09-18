import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings, Upload } from "lucide-react";
import { WatchlistImporter } from "@/components/watchlist-importer";

export function ImportSettings() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          data-testid="button-import-settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Watchlist
          </DialogTitle>
          <DialogDescription>
            Upload watchlist files or paste symbol data directly from ThinkOrSwim exports
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-6">
          <WatchlistImporter />
        </div>
      </DialogContent>
    </Dialog>
  );
}