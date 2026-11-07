import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";

export function DashboardIntro() {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Dasbor admin</CardTitle>
        <CardDescription>Area pengelolaan Lahlah.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Fitur pengelolaan sedang disiapkan.</p>
      </CardContent>
    </Card>
  );
}
