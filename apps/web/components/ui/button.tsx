'use client'
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-background hover:bg-primary/90 hover:shadow-glow-primary active:scale-95',
        destructive: 'bg-danger text-white hover:bg-danger/90 active:scale-95',
        outline: 'border border-border bg-transparent text-foreground hover:bg-background-elevated hover:border-border-hover active:scale-95',
        secondary: 'bg-background-elevated text-foreground hover:bg-background-hover active:scale-95',
        ghost: 'text-foreground hover:bg-background-elevated active:scale-95',
        link: 'text-primary underline-offset-4 hover:underline',
        gold: 'bg-secondary text-background hover:bg-secondary/90 hover:shadow-glow-secondary active:scale-95',
        gradient: 'bg-gradient-to-r from-primary to-secondary text-background hover:opacity-90 hover:shadow-glow-primary active:scale-95',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-12 rounded-xl px-8 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
