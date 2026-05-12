import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NotificationsSettingsForm } from "./_components/NotificationsSettingsForm";


export const dynamic = "force-dynamic";
export const metadata = {
  title: "Impostazioni notifiche — Vinifera",
};

export default function NotificationsSettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>Impostazioni</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Notifiche</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Notifiche
        </h1>
        <p className="text-sm text-muted-foreground">
          Configura Telegram e Email per i promemoria automatici.
        </p>
      </div>
      <NotificationsSettingsForm />
    </div>
  );
}
