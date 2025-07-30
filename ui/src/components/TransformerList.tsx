import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Transformer } from "./ConfigProvider";

interface TransformerListProps {
  transformers: Transformer[];
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

export function TransformerList({ transformers, onEdit, onRemove }: TransformerListProps) {
  // Handle case where transformers might be null or undefined
  if (!transformers || !Array.isArray(transformers)) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center rounded-md border bg-white p-8 text-gray-500">
          No transformers configured
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transformers.map((transformer, index) => {
        // Handle case where individual transformer might be null or undefined
        if (!transformer) {
          return (
            <div key={index} className="flex items-start justify-between rounded-md border bg-white p-4 transition-all hover:shadow-md animate-slide-in hover:scale-[1.01]">
              <div className="flex-1 space-y-1.5">
                <p className="text-md font-semibold text-gray-800">Invalid Transformer</p>
                <p className="text-sm text-gray-500">Transformer data is missing</p>
              </div>
              <div className="ml-4 flex flex-shrink-0 items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => onEdit(index)} className="transition-all-ease hover:scale-110" disabled>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="destructive" size="icon" onClick={() => onRemove(index)} className="transition-all duration-200 hover:scale-110">
                  <Trash2 className="h-4 w-4 text-current transition-colors duration-200" />
                </Button>
              </div>
            </div>
          );
        }

        // Handle case where transformer.path might be null or undefined
        const transformerPath = transformer.path || "Unnamed Transformer";
        
        // Handle case where transformer.options might be null or undefined
        const options = transformer.options || {};
        
        // Handle case where options.project might be null or undefined
        const project = options.project || "No Project";

        return (
          <div key={index} className="flex items-start justify-between rounded-md border bg-white p-4 transition-all hover:shadow-md animate-slide-in hover:scale-[1.01]">
            <div className="flex-1 space-y-1.5">
              <p className="text-md font-semibold text-gray-800">{transformerPath}</p>
              <p className="text-sm text-gray-500">{project}</p>
            </div>
            <div className="ml-4 flex flex-shrink-0 items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => onEdit(index)} className="transition-all-ease hover:scale-110">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="icon" onClick={() => onRemove(index)} className="transition-all duration-200 hover:scale-110">
                <Trash2 className="h-4 w-4 text-current transition-colors duration-200" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
