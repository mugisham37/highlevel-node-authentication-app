import { cn } from '@/lib/utils';
import { createContext, forwardRef, useContext } from 'react';

interface RadioGroupContextValue {
  value?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  name?: string | undefined;
}

const RadioGroupContext = createContext<RadioGroupContextValue>({});

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
}

const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, onValueChange, name, ...props }, ref) => {
    return (
      <RadioGroupContext.Provider value={{ value, onValueChange, name }}>
        <div className={cn('grid gap-2', className)} {...props} ref={ref} role="radiogroup" />
      </RadioGroupContext.Provider>
    );
  }
);
RadioGroup.displayName = 'RadioGroup';

export interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const RadioGroupItem = forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, ...props }, ref) => {
    const { value: contextValue, onValueChange, name } = useContext(RadioGroupContext);

    return (
      <input
        type="radio"
        className={cn(
          'h-4 w-4 border-gray-300 text-primary-600 shadow-sm focus:border-primary-500 focus:ring-primary-500',
          className
        )}
        ref={ref}
        name={name}
        checked={contextValue === props.value}
        onChange={e => {
          if (e.target.checked && onValueChange) {
            onValueChange(props.value as string);
          }
        }}
        {...props}
      />
    );
  }
);
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
