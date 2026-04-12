import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const LoadingCard = () => {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-8 w-3/5" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-3 w-4/5" />
      </CardContent>
    </Card>
  );
};
