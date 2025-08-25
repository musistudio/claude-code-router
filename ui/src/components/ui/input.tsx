import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const isNumeric = type === "number";
    const [tempValue, setTempValue] = React.useState(props.value?.toString() || '');
    
    React.useEffect(() => {
      if (props.value !== undefined) {
        setTempValue(props.value.toString());
      }
    }, [props.value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      
      if (isNumeric) {
        // Only allow empty string or numbers for numeric input
        if (newValue === '' || /^\d+$/.test(newValue)) {
          setTempValue(newValue);
          // Only call onChange if the value is not empty
          if (props.onChange && newValue !== '') {
            props.onChange(e);
          }
        }
      } else {
        setTempValue(newValue);
        if (props.onChange) {
          props.onChange(e);
        }
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (isNumeric && tempValue === '') {
        const defaultValue = props.placeholder || "1";
        setTempValue(defaultValue);
        
        // Create a synthetic event for the corrected value
        if (props.onChange) {
          const syntheticEvent = {
            ...e,
            target: { ...e.target, value: defaultValue }
          } as React.ChangeEvent<HTMLInputElement>;
          
          props.onChange(syntheticEvent);
        }
      }
      
      if (props.onBlur) {
        props.onBlur(e);
      }
    };

    // For numeric inputs, use text type and manage value internally
    const inputType = isNumeric ? "text" : type;
    const inputValue = isNumeric ? tempValue : props.value;

    return (
      <input
        {...props}
        type={inputType}
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
