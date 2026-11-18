/** Avada's button and table primitives: class names only, no behaviour beyond `busy`. The look comes from the classes
 *  each call site adds. */
import * as React from 'react';
import { cn } from './cn';

export type AvButtonProps = React.ComponentProps<'button'> & {
  /** primary: the one solid button of an area; outline; ghost; icon (square, label in aria-label). */
  variant?: 'primary' | 'outline' | 'ghost' | 'icon';
  size?: 'sm' | 'lg';
  /** Full width. */
  block?: boolean;
  /** Waiting on its action: a click does nothing and the button keeps focus (unlike `disabled`, which drops it). */
  busy?: boolean;
};

export function AvButton({ variant = 'outline', size, block, busy, className, type = 'button', onClick, ...props }: AvButtonProps) {
  return (
    <button
      type={type}
      className={cn('av-btn', `av-btn--${variant}`, size && `av-btn--${size}`, block && 'av-btn--block', busy && 'is-busy', className)}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (busy) e.preventDefault();
        else onClick?.(e);
      }}
      {...props}
    />
  );
}

export type AvTableProps = React.ComponentProps<'table'> & {
  /** 32 px rows. */
  dense?: boolean;
  /** Wrapped cells, a sub-line under a value. */
  tight?: boolean;
};

export function AvTable({ dense, tight, className, ...props }: AvTableProps) {
  return <table className={cn('av-table', dense && 'av-table--dense', tight && 'av-table--tight', className)} {...props} />;
}
