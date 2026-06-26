import { Loader2Icon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const LoadingCard = () => {
  return (
    <Card className="glass animate-in fade-in duration-500">
      <CardHeader>
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-8 w-3/5" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 animate-glow-pulse">
            <Loader2Icon className="h-3 w-3 animate-spin text-primary" />
          </span>
          <Skeleton className="h-3 w-4/5" />
        </div>
      </CardContent>
    </Card>
  );
};
