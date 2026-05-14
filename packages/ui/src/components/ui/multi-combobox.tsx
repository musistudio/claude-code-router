"use client"

import * as React from "react"
import { Check, ChevronsUpDown, GripVertical, X } from "lucide-react"

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
import { Badge } from "@/components/ui/badge"

interface MultiComboboxProps {
  options: { label: string; value: string }[];
  value?: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  // When true, selected badges can be reordered via drag-and-drop. The new
  // ordering is passed to onChange. Useful when order is semantically meaningful
  // (e.g. fallback model priority lists).
  reorderable?: boolean;
}

export function MultiCombobox({
  options,
  value = [],
  onChange,
  placeholder = "Select options...",
  searchPlaceholder = "Search...",
  emptyPlaceholder = "No options found.",
  reorderable = false,
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [overIndex, setOverIndex] = React.useState<number | null>(null)

  const handleSelect = (currentValue: string) => {
    if (value.includes(currentValue)) {
      onChange(value.filter(v => v !== currentValue))
    } else {
      onChange([...value, currentValue])
    }
  }

  const removeValue = (val: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter(v => v !== val))
  }

  const handleDragStart = (index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = "move"
    // Firefox requires data to be set for drag to initiate.
    e.dataTransfer.setData("text/plain", String(index))
  }

  const handleDragOver = (index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    if (dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (overIndex !== index) {
      setOverIndex(index)
    }
  }

  const handleDrop = (index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setOverIndex(null)
      return
    }
    const next = [...value]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(index, 0, moved)
    setDragIndex(null)
    setOverIndex(null)
    onChange(next)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((val, index) => {
          const option = options.find(opt => opt.value === val)
          const isDragging = reorderable && dragIndex === index
          const isOver = reorderable && overIndex === index && dragIndex !== null && dragIndex !== index
          return (
            <div
              key={val}
              draggable={reorderable}
              onDragStart={reorderable ? handleDragStart(index) : undefined}
              onDragOver={reorderable ? handleDragOver(index) : undefined}
              onDrop={reorderable ? handleDrop(index) : undefined}
              onDragEnd={reorderable ? handleDragEnd : undefined}
              className={cn(
                "transition-opacity",
                isDragging && "opacity-50",
                isOver && "ring-2 ring-primary rounded-md",
              )}
            >
              <Badge variant="outline" className="font-normal">
                {reorderable && (
                  <GripVertical
                    className="mr-1 h-3 w-3 cursor-grab text-muted-foreground active:cursor-grabbing"
                    aria-hidden
                  />
                )}
                {option?.label || val}
                <button
                  onClick={(e) => removeValue(val, e)}
                  className="ml-1 rounded-full hover:bg-gray-200"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )
        })}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between transition-all-ease hover:scale-[1.02] active:scale-[0.98]"
          >
            {value.length > 0 ? `${value.length} selected` : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
                        value.includes(option.value) ? "opacity-100" : "opacity-0"
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
}
