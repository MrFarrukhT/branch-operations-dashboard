import * as React from 'react';
import { cn } from './cn';

/**
 * A plain <select> with a drawn chevron in place of the operating system's arrow, so it looks the same on every platform.
 * The chevron is a background image, so a caller's classes and `style` still apply. A list box (`multiple`, or `size` > 1)
 * keeps no chevron.
 */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, style, ...props }, ref) => {
  const listBox = Boolean(props.multiple) || (props.size ?? 0) > 1;
  return (
    <select
      ref={ref}
      data-slot="native-select"
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        listBox ? "px-3" : "appearance-none bg-no-repeat pl-3 pr-8",
        className
      )}
      style={
        listBox
          ? style
          : { backgroundImage: CHEVRON, backgroundPosition: "right 0.6rem center", backgroundSize: "16px", ...style }
      }
      {...props}
    />
  );
});
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
