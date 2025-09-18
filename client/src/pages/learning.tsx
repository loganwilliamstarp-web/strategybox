import { LearningPath } from "@/components/learning-path";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function LearningPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="button-back-dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Options Trading Learn</h1>
                <p className="text-sm text-muted-foreground">
                  Master options trading through interactive lessons and quizzes
                </p>
              </div>
            </div>
            
            {user && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Welcome back, {user.email?.split('@')[0]}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <LearningPath />
      </main>
    </div>
  );
}