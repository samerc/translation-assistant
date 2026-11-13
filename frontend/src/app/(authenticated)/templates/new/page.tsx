'use client';

import { RequirePermission } from '@/components/RequirePermission';
import { TemplateSetupWizard } from '../setup-wizard';

export default function NewTemplatePage() {
  return (
    <RequirePermission permission="templates:create">
      <TemplateSetupWizard />
    </RequirePermission>
  );
}
