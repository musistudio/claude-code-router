export type ConfigurationDocModule = {
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

export const zhConfigurationDocs = import.meta.glob<ConfigurationDocModule>(
  "./content/docs/zh/configuration/*.md",
  { eager: true }
);

export const enConfigurationDocs = import.meta.glob<ConfigurationDocModule>(
  "./content/docs/en/configuration/*.md",
  { eager: true }
);

export function configurationSlugFromPath(filePath: string): string {
  const file = filePath.split("/").pop() ?? filePath;
  return file.replace(/\.md$/, "");
}

