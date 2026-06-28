import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const LoadingCard = () => {
  return (
    <Card className="glass animate-in fade-in duration-500">
      <CardHeader>
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-8 w-3/5" />
      </CardHeader>
    </Card>
  );
};
