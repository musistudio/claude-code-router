import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Provider } from "@/types";

interface ProviderListProps {
  providers: Provider[];
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

export function ProviderList({ providers, onEdit, onRemove }: ProviderListProps) {
  // Handle case where providers might be null or undefined
  if (!providers || !Array.isArray(providers)) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center rounded-md border bg-white p-8 text-gray-500">
          No providers configured
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {providers.map((provider, index) => {
        // Handle case where individual provider might be null or undefined
        if (!provider) {
          return (
            <div key={index} className="flex items-start justify-between rounded-md border bg-white p-4 transition-all hover:shadow-md animate-slide-in hover:scale-[1.01]">
              <div className="flex-1 space-y-1.5">
                <p className="text-md font-semibold text-gray-800">Invalid Provider</p>
                <p className="text-sm text-gray-500">Provider data is missing</p>
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

        // Handle case where provider.name might be null or undefined
        const providerName = provider.name || "Unnamed Provider";
        
        // Handle case where provider.api_base_url might be null or undefined
        const apiBaseUrl = provider.api_base_url || "No API URL";
        
        // Handle case where provider.models might be null or undefined
        const models = Array.isArray(provider.models) ? provider.models : [];

        return (
          <div key={index} className="flex items-start justify-between rounded-md border bg-white p-4 transition-all hover:shadow-md animate-slide-in hover:scale-[1.01]">
            <div className="flex-1 space-y-1.5">
              <p className="text-md font-semibold text-gray-800">{providerName}</p>
              <p className="text-sm text-gray-500">{apiBaseUrl}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                {models.map((model, modelIndex) => (
                  // Handle case where model might be null or undefined
                  <Badge key={modelIndex} variant="outline" className="font-normal transition-all-ease hover:scale-105">
                    {model || "Unnamed Model"}
                  </Badge>
                ))}
              </div>
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