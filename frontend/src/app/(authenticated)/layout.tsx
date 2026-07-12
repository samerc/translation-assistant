import AppLayout from "@/components/layout/AppLayout";
import AuthGuard from "@/components/layout/AuthGuard";
import { SettingsProvider } from "@/lib/settings-context";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <SettingsProvider>
        <AppLayout>{children}</AppLayout>
      </SettingsProvider>
    </AuthGuard>
  );
}
