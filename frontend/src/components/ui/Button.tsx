import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonStyle {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  iconOnly?: boolean;
}

/** Class string for a button look — also for <Link>s styled as buttons. */
export function buttonClass({ variant = 'secondary', size = 'md', iconOnly = false }: ButtonStyle = {}, extra = '') {
  return ['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', iconOnly && 'btn-icon', extra].filter(Boolean).join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyle {
  icon?: ReactNode;
}

export function Button({ variant, size, iconOnly, icon, className = '', type = 'button', children, ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClass({ variant, size, iconOnly }, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}
