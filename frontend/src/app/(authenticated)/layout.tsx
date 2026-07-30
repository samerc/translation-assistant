import AppLayout from "@/components/layout/AppLayout";
import AuthGuard from "@/components/layout/AuthGuard";
import { SettingsProvider } from "@/lib/settings-context";
import { ConfirmHost } from "@/lib/confirm";
import { ToastHost } from "@/lib/toast";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <SettingsProvider>
        <AppLayout>{children}</AppLayout>
        <ConfirmHost />
        <ToastHost />
      </SettingsProvider>
    </AuthGuard>
  );
}
