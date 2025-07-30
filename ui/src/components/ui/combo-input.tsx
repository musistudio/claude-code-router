"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ComboInputProps {
  options: { label: string; value: string }[];
  value?: string;
  onChange: (value: string) => void;
  onEnter?: (value: string) => void;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  inputPlaceholder?: string;
}

export const ComboInput = React.forwardRef<HTMLInputElement, ComboInputProps>(({
  options,
  value,
  onChange,
  onEnter,
  searchPlaceholder = "Search...",
  emptyPlaceholder = "No options found.",
  inputPlaceholder = "Type or select...",
}, ref) => {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value || "")
  const internalInputRef = React.useRef<HTMLInputElement>(null)

  // Forward ref to the internal input
  React.useImperativeHandle(ref, () => internalInputRef.current as HTMLInputElement)

  React.useEffect(() => {
    setInputValue(value || "")
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim() && onEnter) {
      onEnter(inputValue.trim())
      setInputValue("")
    }
  }

  const handleSelect = (selectedValue: string) => {
    setInputValue(selectedValue)
    onChange(selectedValue)
    if (onEnter) {
      onEnter(selectedValue)
      setInputValue("")
    }
    setOpen(false)
  }

  // Function to get current value for external access
  const getCurrentValue = () => inputValue

  // Expose methods through the ref
  React.useImperativeHandle(ref, () => ({
    ...internalInputRef.current!,
    value: inputValue,
    getCurrentValue,
    clearInput: () => {
      setInputValue("")
      onChange("")
    }
  }))

  return (
    <div className="relative">
      <Input
        ref={internalInputRef}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={inputPlaceholder}
        className="pr-10"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
          >
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 animate-fade-in">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyPlaceholder}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="transition-all-ease hover:bg-accent hover:text-accent-foreground"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 transition-opacity",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
})