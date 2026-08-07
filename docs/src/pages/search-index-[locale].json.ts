import type { APIRoute, GetStaticPaths } from "astro";
import { docModule, docPages, getSection, type Locale } from "../docs-structure";

export const getStaticPaths: GetStaticPaths = () => [
  { params: { locale: "zh" } },
  { params: { locale: "en" } },
];

const baseUrl = import.meta.env.BASE_URL ?? "/";
const basePath = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
const withBasePath = (path: string) => `${basePath}${path.replace(/^\//, "")}`;

/** Strip markdown syntax, dropping fenced code block contents but keeping prose. */
const stripMarkdown = (markdown: string): string =>
  markdown
    .replace(/^(```|~~~)[\s\S]*?(\1\s*$|$)/gm, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, "$2")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Heading {
  depth: number;
  slug: string;
  text: string;
}

/** Split raw markdown into prose slices per h2/h3 heading, zipped with heading slugs. */
const sectionSlices = (markdown: string, headings: Heading[]) => {
  const targetHeadings = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 3);
  const slices: { heading?: Heading; text: string }[] = [];
  let current: { heading?: Heading; lines: string[] } = { lines: [] };
  let headingIndex = 0;
  let inFence = false;

  const flush = () => {
    const text = stripMarkdown(current.lines.join("\n"));
    if (current.heading && text) {
      slices.push({ heading: current.heading, text });
    }
  };

  for (const line of markdown.split("\n")) {
    if (/^(```|~~~)/.test(line.trimStart())) {
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;

    if (/^#{2,3}\s/.test(line) && headingIndex < targetHeadings.length) {
      flush();
      current = { heading: targetHeadings[headingIndex], lines: [] };
      headingIndex += 1;
      continue;
    }

    current.lines.push(line);
  }

  flush();
  return slices;
};

export const GET: APIRoute = ({ params }) => {
  const locale = params.locale as Locale;

  const entries = docPages.flatMap((page) => {
    const doc = docModule(locale, page.source[locale]);
    const section = getSection(page.section);
    const title = String(doc.frontmatter.title ?? page.label[locale]);
    const breadcrumb =
      page.key === page.section
        ? section.navLabel[locale]
        : `${section.navLabel[locale]} / ${page.label[locale]}`;
    const path = withBasePath(page.path[locale]);
    const headings = doc
      .getHeadings()
      .filter((heading) => heading.depth >= 2 && heading.depth <= 5)
      .map((heading) => ({ text: heading.text, slug: heading.slug }));
    const raw = doc.rawContent();

    const pageEntry = {
      kind: "page",
      title,
      breadcrumb,
      path,
      headings,
      excerpt: stripMarkdown(raw).slice(0, 300),
    };

    const sectionEntries = sectionSlices(raw, doc.getHeadings()).map((slice) => ({
      kind: "section",
      title: slice.heading!.text,
      breadcrumb: title,
      path: `${path}#${slice.heading!.slug}`,
      excerpt: slice.text,
    }));

    return [pageEntry, ...sectionEntries];
  });

  return new Response(JSON.stringify(entries), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
