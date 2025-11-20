"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

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
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  emptyPlaceholder = "No options found.",
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between transition-all-ease hover:scale-[1.02] active:scale-[0.98]"
        >
          {selectedOption
            ? selectedOption.displayLabel || selectedOption.label
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
