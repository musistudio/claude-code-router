import { cloneAsset, getPresetById, type MorphAsset } from "@musistudio/lucide-morph-react";

function directMorphAsset(preset: string): MorphAsset {
  const asset = cloneAsset(getPresetById(preset));
  asset.id = `${asset.id}-direct`;
  delete asset.loading;
  for (const layer of asset.layers) {
    delete layer.loading;
    delete layer.loadingOpacity;
  }
  return asset;
}

export const collapseSidebarToExpandInspectorMorph = directMorphAsset("collapse-sidebar-to-expand-inspector");
export const playPauseMorph = directMorphAsset("play-pause");
