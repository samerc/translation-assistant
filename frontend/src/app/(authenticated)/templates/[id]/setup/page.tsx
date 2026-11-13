'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { RequirePermission } from '@/components/RequirePermission';
import { TemplateSetupWizard } from '../../setup-wizard';

function Setup() {
  const { id } = useParams<{ id: string }>();
  const step = useSearchParams().get('step');
  return <TemplateSetupWizard key={id} templateId={id} initialStep={step} />;
}

export default function TemplateSetupPage() {
  return (
    <RequirePermission permission="templates:update">
      <Suspense fallback={null}>
        <Setup />
      </Suspense>
    </RequirePermission>
  );
}
