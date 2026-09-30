import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-3 border-b border-border px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function Badge({
  className,
  variant = 'secondary',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: 'secondary' | 'outline' | 'default' | 'destructive' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        variant === 'default' && 'bg-primary text-primary-foreground',
        variant === 'secondary' && 'bg-muted text-muted-foreground',
        variant === 'outline' && 'border border-border',
        variant === 'destructive' && 'border border-destructive/30 bg-destructive/10 text-destructive',
        className
      )}
      {...props}
    />
  );
}
