import type { ReactNode } from 'react';

export function EmptyState({ icon, title, description, action, className = '' }: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center text-center gap-2 px-6 py-12 ${className}`}>
      {icon && (
        <div className="w-10 h-10 rounded-[10px] bg-sunken text-text-secondary grid place-items-center mb-1 [&_svg]:w-5 [&_svg]:h-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description && <p className="text-sm text-text-secondary max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
