"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { HexColorPicker } from "react-colorful"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface ColorPickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showPreview?: boolean;
}

// 获取颜色值的函数
const getColorValue = (color: string): string => {
  // 如果是十六进制颜色
  if (color.startsWith("#")) {
    return color
  }
  
  // 默认返回黑色
  return "#000000"
}

export function ColorPicker({
  value = "",
  onChange,
  placeholder,
  showPreview = true
}: ColorPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [customColor, setCustomColor] = React.useState("")
  
  // 当value变化时更新customColor
  React.useEffect(() => {
    if (value.startsWith("#")) {
      setCustomColor(value)
    } else {
      setCustomColor("")
    }
  }, [value])

  const handleColorChange = (color: string) => {
    onChange(color)
  }

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value
    setCustomColor(color)
    // 验证十六进制颜色格式
    if (/^#[0-9A-F]{6}$/i.test(color)) {
      handleColorChange(color)
    }
  }

  
  const selectedColorValue = getColorValue(value)

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-10 transition-all hover:scale-[1.02] active:scale-[0.98]",
              !value && "text-muted-foreground"
            )}
          >
            <div className="flex items-center gap-2 w-full">
              {showPreview && (
                <div 
                  className="h-5 w-5 rounded border shadow-sm" 
                  style={{ backgroundColor: selectedColorValue }}
                />
              )}
              <span className="truncate flex-1">
                {value || placeholder || t('color_picker.placeholder')}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 15 5 5 5-5"/>
                <path d="m7 9 5-5 5 5"/>
              </svg>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-4">
            {/* 颜色选择器标题 */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{t('color_picker.title')}</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => handleColorChange("")}
              >
                {t('color_picker.clear')}
              </Button>
            </div>
            
            {/* 颜色预览 */}
            <div className="flex items-center gap-2 p-2 rounded-md bg-secondary">
              <div 
                className="h-8 w-8 rounded border shadow-sm" 
                style={{ backgroundColor: selectedColorValue }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {value || t('color_picker.no_color_selected')}
                </div>
                {value && value.startsWith("#") && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {value.toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            
            {/* 颜色选择器 */}
            <div className="rounded-md overflow-hidden border">
              <HexColorPicker 
                color={selectedColorValue} 
                onChange={handleColorChange} 
                className="w-full" 
              />
            </div>
            
            {/* 自定义颜色输入 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('color_picker.custom_color')}</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={customColor}
                  onChange={handleCustomColorChange}
                  placeholder="#RRGGBB"
                  className="font-mono flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (customColor && /^#[0-9A-F]{6}$/i.test(customColor)) {
                      handleColorChange(customColor)
                      setOpen(false)
                    }
                  }}
                  disabled={!customColor || !/^#[0-9A-F]{6}$/i.test(customColor)}
                >
                  {t('color_picker.apply')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('color_picker.hex_input_help')}
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
