"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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

interface ComboboxProps {
  options: {
    label: string;
    value: string;
    group?: string;
    displayLabel?: string;
  }[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  clearable?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  emptyPlaceholder = "No options found.",
  clearable = true,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedOption = options.find((option) => option.value === value)

  // Check if any options have groups
  const hasGroups = React.useMemo(() => {
    return options.some((option) => option.group !== undefined);
  }, [options])

  // Group options by their group property if groups exist
  const groupedOptions = React.useMemo(() => {
    if (!hasGroups) {
      // If no groups, return all options in a single unnamed group
      return [[undefined, options] as [undefined, typeof options]]
    }

    const groups = new Map<string, typeof options>()

    options.forEach((option) => {
      const groupName = option.group || "Other";
      if (!groups.has(groupName)) {
        groups.set(groupName, [])
      }
      groups.get(groupName)?.push(option)
    });

    return Array.from(groups.entries());
  }, [options, hasGroups])

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between transition-all-ease hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="truncate">
            {selectedOption
              ? selectedOption.displayLabel || selectedOption.label
              : placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {clearable && value && (
              <span
                role="button"
                tabIndex={0}
                className="p-1 rounded-full hover:bg-black/20 dark:hover:bg-white/20 cursor-pointer transition-colors"
                onClick={handleClear}
              >
                <X className="h-3.5 w-3.5 opacity-50 hover:opacity-100 transition-opacity" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 animate-fade-in">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyPlaceholder}</CommandEmpty>
            {groupedOptions.map(([groupName, groupOptions]) => (
              <CommandGroup key={groupName || "default"} heading={groupName}>
                {groupOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={(currentValue) => {
                      onChange(currentValue === value ? "" : currentValue)
                      setOpen(false)
                    }}
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
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
