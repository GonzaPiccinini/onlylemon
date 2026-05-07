import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="gap-3">
          <CardTitle className="font-heading text-2xl">404</CardTitle>
          <CardDescription>
            La página que buscas no existe o fue movida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/")}>Volver al inicio</Button>
        </CardContent>
      </Card>
    </div>
  );
};
