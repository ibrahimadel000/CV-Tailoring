import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  locked?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, locked, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('card', locked && 'card--locked', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';
