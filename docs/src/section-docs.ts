export type SectionDocModule = {
  Content: any;
  frontmatter: {
    title?: string;
    pageTitle?: string;
    eyebrow?: string;
    lead?: string;
    [key: string]: unknown;
  };
  getHeadings: () => { depth: number; slug: string; text: string }[];
  rawContent: () => string;
};

export const zhGuideDocs = import.meta.glob<SectionDocModule>(
  "./content/docs/zh/guides/*.md",
  { eager: true }
);

export const enGuideDocs = import.meta.glob<SectionDocModule>(
  "./content/docs/en/guides/*.md",
  { eager: true }
);

export function sectionSlugFromPath(filePath: string): string {
  const file = filePath.split("/").pop() ?? filePath;
  return file.replace(/\.md$/, "");
}
