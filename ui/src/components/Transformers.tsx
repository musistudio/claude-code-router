import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useConfig } from "./ConfigProvider";
import { TransformerList } from "./TransformerList";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function Transformers() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();
  const [editingTransformerIndex, setEditingTransformerIndex] = useState<number | null>(null);
  const [deletingTransformerIndex, setDeletingTransformerIndex] = useState<number | null>(null);
  const [newTransformer, setNewTransformer] = useState<{ path: string; options: { [key: string]: string } } | null>(null);

  if (!config) {
    return null;
  }

  const handleAddTransformer = () => {
    const newTransformer = { path: "", options: {} };
    setNewTransformer(newTransformer);
    setEditingTransformerIndex(config.transformers.length); // Use the length as index for the new item
  };

  const handleRemoveTransformer = (index: number) => {
    const newTransformers = [...config.transformers];
    newTransformers.splice(index, 1);
    setConfig({ ...config, transformers: newTransformers });
    setDeletingTransformerIndex(null);
  };

  const handleTransformerChange = (index: number, field: string, value: string, optionKey?: string) => {
    if (index < config.transformers.length) {
      // Editing an existing transformer
      const newTransformers = [...config.transformers];
      if (optionKey !== undefined) {
        newTransformers[index].options[optionKey] = value;
      } else {
        (newTransformers[index] as Record<string, unknown>)[field] = value;
      }
      setConfig({ ...config, transformers: newTransformers });
    } else {
      // Editing the new transformer
      if (newTransformer) {
        const updatedTransformer = { ...newTransformer };
        if (optionKey !== undefined) {
          updatedTransformer.options[optionKey] = value;
        } else {
          (updatedTransformer as Record<string, unknown>)[field] = value;
        }
        setNewTransformer(updatedTransformer);
      }
    }
  };

  const editingTransformer = editingTransformerIndex !== null ? 
    (editingTransformerIndex < config.transformers.length ? 
      config.transformers[editingTransformerIndex] : 
      newTransformer) : 
    null;

  const handleSaveTransformer = () => {
    if (newTransformer && editingTransformerIndex === config.transformers.length) {
      // Saving a new transformer
      const newTransformers = [...config.transformers, newTransformer];
      setConfig({ ...config, transformers: newTransformers });
    }
    // Close the dialog
    setEditingTransformerIndex(null);
    setNewTransformer(null);
  };

  const handleCancelTransformer = () => {
    // Close the dialog without saving
    setEditingTransformerIndex(null);
    setNewTransformer(null);
  };

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b p-4">
        <CardTitle className="text-lg">{t("transformers.title")} <span className="text-sm font-normal text-gray-500">({config.transformers.length})</span></CardTitle>
        <Button onClick={handleAddTransformer}>{t("transformers.add")}</Button>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4">
        <TransformerList
          transformers={config.transformers}
          onEdit={setEditingTransformerIndex}
          onRemove={setDeletingTransformerIndex}
        />
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editingTransformerIndex !== null} onOpenChange={handleCancelTransformer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transformers.edit")}</DialogTitle>
          </DialogHeader>
          {editingTransformer && editingTransformerIndex !== null && (
            <div className="space-y-4 py-4 px-6 max-h-96 overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="transformer-path">{t("transformers.path")}</Label>
                <Input 
                  id="transformer-path" 
                  value={editingTransformer.path} 
                  onChange={(e) => handleTransformerChange(editingTransformerIndex, "path", e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("transformers.parameters")}</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const newKey = `param${Object.keys(editingTransformer.options).length + 1}`;
                      if (editingTransformerIndex !== null) {
                        const newOptions = { ...editingTransformer.options, [newKey]: "" };
                        if (editingTransformerIndex < config.transformers.length) {
                          const newTransformers = [...config.transformers];
                          newTransformers[editingTransformerIndex].options = newOptions;
                          setConfig({ ...config, transformers: newTransformers });
                        } else if (newTransformer) {
                          setNewTransformer({ ...newTransformer, options: newOptions });
                        }
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {Object.entries(editingTransformer.options).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Input 
                      value={key} 
                      onChange={(e) => {
                        const newOptions = { ...editingTransformer.options };
                        delete newOptions[key];
                        newOptions[e.target.value] = value;
                        if (editingTransformerIndex !== null) {
                          if (editingTransformerIndex < config.transformers.length) {
                            const newTransformers = [...config.transformers];
                            newTransformers[editingTransformerIndex].options = newOptions;
                            setConfig({ ...config, transformers: newTransformers });
                          } else if (newTransformer) {
                            setNewTransformer({ ...newTransformer, options: newOptions });
                          }
                        }
                      }}
                      className="flex-1"
                    />
                    <Input 
                      value={value} 
                      onChange={(e) => {
                        if (editingTransformerIndex !== null) {
                          handleTransformerChange(editingTransformerIndex, "options", e.target.value, key);
                        }
                      }}
                      className="flex-1"
                    />
                    <Button 
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (editingTransformerIndex !== null) {
                          const newOptions = { ...editingTransformer.options };
                          delete newOptions[key];
                          if (editingTransformerIndex < config.transformers.length) {
                            const newTransformers = [...config.transformers];
                            newTransformers[editingTransformerIndex].options = newOptions;
                            setConfig({ ...config, transformers: newTransformers });
                          } else if (newTransformer) {
                            setNewTransformer({ ...newTransformer, options: newOptions });
                          }
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelTransformer}>{t("app.cancel")}</Button>
            <Button onClick={handleSaveTransformer}>{t("app.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deletingTransformerIndex !== null} onOpenChange={() => setDeletingTransformerIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transformers.delete")}</DialogTitle>
            <DialogDescription>
              {t("transformers.delete_transformer_confirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTransformerIndex(null)}>{t("app.cancel")}</Button>
            <Button variant="destructive" onClick={() => deletingTransformerIndex !== null && handleRemoveTransformer(deletingTransformerIndex)}>{t("app.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
