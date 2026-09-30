import * as React from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select as SystemSelect, type SelectOption } from '@/components/ui/Select';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

/** Drop-in: accepts native <option> children; renders system dropdown. */
export const Select = React.forwardRef<
  HTMLButtonElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'size'> & {
    onChange?: (e: { target: { value: string } }) => void;
    size?: 'default' | 'sm';
  }
>(({ className, children, value, id, disabled, size = 'default', ...props }, _ref) => {
  const options: SelectOption[] = React.Children.toArray(children)
    .map((child) => {
      if (!React.isValidElement(child)) return null;
      const v = child.props.value;
      const label = typeof child.props.children === 'string' ? child.props.children : String(v);
      return { value: String(v), label } as SelectOption;
    })
    .filter(Boolean) as SelectOption[];

  return (
    <SystemSelect
      id={id}
      className={className}
      disabled={disabled}
      size={size}
      value={String(value ?? '')}
      options={options}
      aria-label={props['aria-label']}
      onChange={(v) => props.onChange?.({ target: { value: v } })}
    />
  );
});
Select.displayName = 'Select';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[120px] w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      className
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-semibold text-muted-foreground', className)} {...props} />;
}

/** Parameter label with optional help icon + description tooltip. */
export function FieldLabel({
  children,
  htmlFor,
  hint,
  className,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground', className)}
    >
      {children}
      {hint ? (
        <span
          className="group relative inline-flex cursor-help"
          tabIndex={0}
          aria-label={hint}
          title={hint}
        >
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground" />
          <span
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-2 text-[11px] font-normal leading-4 text-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus:opacity-100"
          >
            {hint}
          </span>
        </span>
      ) : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
        checked ? 'border-primary bg-primary' : 'border-border bg-muted',
        'disabled:opacity-50'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all',
          checked ? 'left-[calc(100%-18px)]' : 'left-0.5'
        )}
      />
    </button>
  );
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  id,
}: {
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValueChange(Number(e.target.value))}
      className="w-full accent-[hsl(var(--primary))]"
    />
  );
}
