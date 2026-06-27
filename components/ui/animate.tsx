'use client';

import { ReactNode, CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface AnimateProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

export function FadeIn({ children, className, delay = 0, duration = 0.4 }: AnimateProps) {
  return (
    <div
      className={cn('animate-fade-in', className)}
      style={{
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
        animationFillMode: 'both',
      }}
    >
      {children}
    </div>
  );
}

export function SlideIn({ children, className, delay = 0, from = 'bottom' }: AnimateProps & { from?: 'top' | 'bottom' | 'left' | 'right' }) {
  const transforms: Record<string, string> = {
    bottom: 'translateY(20px)',
    top: 'translateY(-20px)',
    left: 'translateX(-20px)',
    right: 'translateX(20px)',
  };
  return (
    <div
      className={cn('animate-fade-in', className)}
      style={{
        animationDelay: `${delay}s`,
        animationDuration: '0.4s',
        animationFillMode: 'both',
        // @ts-ignore
        '--tw-enter-translate-x': from === 'left' || from === 'right' ? transforms[from] : '0',
        '--tw-enter-translate-y': from === 'top' || from === 'bottom' ? transforms[from] : '0',
      }}
    >
      {children}
    </div>
  );
}

export function ScaleIn({ children, className, delay = 0 }: AnimateProps) {
  return (
    <div
      className={cn('animate-fade-in', className)}
      style={{
        animationDelay: `${delay}s`,
        animationDuration: '0.3s',
        animationFillMode: 'both',
      }}
    >
      {children}
    </div>
  );
}
