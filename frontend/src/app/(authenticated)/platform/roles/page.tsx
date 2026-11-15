'use client';

import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { RolesEditor } from '@/components/RolesEditor';

/** The default roles every organization starts with (platform admin). */
export default function PlatformRolesPage() {
  const { user } = useAuth();
  if (!user?.isPlatformAdmin) return null;
  return (
    <div className="max-w-5xl">
      <PageHeader title="Roles"
        description="The roles every organization starts with. Add one (for example Accounting) and every organization can use it." />
      <RolesEditor endpoint="/platform/roles" platform />
    </div>
  );
}
