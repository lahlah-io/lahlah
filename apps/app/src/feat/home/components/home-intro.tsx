import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";

export function HomeIntro() {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Aplikasi Lahlah</CardTitle>
        <CardDescription>Selamat datang di Lahlah.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Ruang aplikasi sedang disiapkan.</p>
      </CardContent>
    </Card>
  );
}
