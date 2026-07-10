import { memo, useEffect, useMemo, useRef, type CSSProperties, type MutableRefObject } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { cn } from "./utils";

type MarkdownRendererProps = {
  className?: string;
  markdown: string;
  style?: CSSProperties;
};

type StreamingMarkdownRendererProps = MarkdownRendererProps & {
  onDone: () => void;
  onFrame: () => void;
  running: boolean;
  streamKey: number;
};

const markdownCache = new Map<string, string>();
const maxCacheEntries = 48;

marked.use({
  async: false,
  breaks: false,
  gfm: true,
  pedantic: false
});

export const MarkdownRenderer = memo(function MarkdownRenderer({
  className,
  markdown,
  style
}: MarkdownRendererProps) {
  const html = useMemo(() => renderMarkdownToHtml(markdown), [markdown]);

  return (
    <div
      className={cn("markdown-stream-panel", className)}
      dangerouslySetInnerHTML={{ __html: html }}
      style={style}
    />
  );
});

export function StreamingMarkdownRenderer({
  className,
  markdown,
  onDone,
  onFrame,
  running,
  style,
  streamKey
}: StreamingMarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const visibleIndexRef = useRef(0);
  const committedIndexRef = useRef(0);
  const lastTailMarkdownRef = useRef("");
  const doneRef = useRef(false);
  const onDoneRef = useLatestRef(onDone);
  const onFrameRef = useLatestRef(onFrame);

  useEffect(() => {
    visibleIndexRef.current = 0;
    committedIndexRef.current = 0;
    lastTailMarkdownRef.current = "";
    doneRef.current = false;
    resetStreamingDom(containerRef.current, tailRef, cursorRef);
    onFrameRef.current();
  }, [onFrameRef, streamKey]);

  useEffect(() => {
    if (doneRef.current && committedIndexRef.current < markdown.length) {
      doneRef.current = false;
    }
    if (!running || doneRef.current) return;

    let frameId = 0;
    let lastFrameTime = performance.now();
    let lastPatchTime = 0;
    let carriedChars = 0;
    const minPatchIntervalMs = markdown.length > 3200 ? 24 : 16;
    const baseCharsPerSecond = markdown.length > 3200 ? 1500 : 720;

    const tick = (now: number) => {
      const elapsed = Math.min(now - lastFrameTime, 96);
      lastFrameTime = now;
      const backlog = markdown.length - visibleIndexRef.current;
      const catchUpCharsPerSecond = Math.min(markdown.length > 3200 ? 1800 : 900, backlog * 1.8);
      const charsPerSecond = baseCharsPerSecond + catchUpCharsPerSecond;
      carriedChars += (elapsed * charsPerSecond) / 1000;

      const charStep = Math.floor(carriedChars);
      if (charStep > 0) {
        carriedChars -= charStep;
        visibleIndexRef.current = Math.min(markdown.length, visibleIndexRef.current + charStep);
      }

      const shouldPatch =
        visibleIndexRef.current >= markdown.length ||
        (now - lastPatchTime >= minPatchIntervalMs && visibleIndexRef.current > committedIndexRef.current);

      if (shouldPatch) {
        lastPatchTime = now;
        patchStreamingMarkdown({
          committedIndexRef,
          container: containerRef.current,
          cursorRef,
          lastTailMarkdownRef,
          markdown,
          tailRef,
          visibleIndex: visibleIndexRef.current
        });
        onFrameRef.current();
      }

      if (visibleIndexRef.current >= markdown.length) {
        doneRef.current = true;
        onDoneRef.current();
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [markdown, onDoneRef, onFrameRef, running, streamKey]);

  return <div className={cn("markdown-stream-panel", className)} ref={containerRef} style={style} />;
}

function renderMarkdownToHtml(markdown: string, shouldCache = true) {
  if (shouldCache) {
    const cached = markdownCache.get(markdown);
    if (cached) return cached;
  }

  const rawHtml = marked.parse(markdown) as string;
  const html = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ["target", "rel"],
    USE_PROFILES: { html: true }
  });

  if (shouldCache) {
    markdownCache.set(markdown, html);
    if (markdownCache.size > maxCacheEntries) {
      const firstKey = markdownCache.keys().next().value;
      if (firstKey) markdownCache.delete(firstKey);
    }
  }

  return html;
}

function renderMarkdownToFragment(markdown: string) {
  const rawHtml = marked.parse(markdown) as string;
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ["target", "rel"],
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true }
  }) as unknown as DocumentFragment;
}

function resetStreamingDom(
  container: HTMLDivElement | null,
  tailRef: MutableRefObject<HTMLDivElement | null>,
  cursorRef: MutableRefObject<HTMLSpanElement | null>
) {
  if (!container) return;

  const tail = document.createElement("div");
  tail.className = "markdown-tail";

  const cursor = document.createElement("span");
  cursor.className = "markdown-stream-cursor";
  cursor.setAttribute("aria-hidden", "true");

  container.replaceChildren(tail, cursor);
  tailRef.current = tail;
  cursorRef.current = cursor;
}

function patchStreamingMarkdown({
  committedIndexRef,
  container,
  cursorRef,
  lastTailMarkdownRef,
  markdown,
  tailRef,
  visibleIndex
}: {
  committedIndexRef: MutableRefObject<number>;
  container: HTMLDivElement | null;
  cursorRef: MutableRefObject<HTMLSpanElement | null>;
  lastTailMarkdownRef: MutableRefObject<string>;
  markdown: string;
  tailRef: MutableRefObject<HTMLDivElement | null>;
  visibleIndex: number;
}) {
  if (!container) return;

  const { tail } = ensureStreamingMarkers(container, tailRef, cursorRef, lastTailMarkdownRef);

  const commitBoundary = findStableCommitBoundary(markdown, committedIndexRef.current, visibleIndex);

  if (commitBoundary > committedIndexRef.current) {
    const completedMarkdown = markdown.slice(committedIndexRef.current, commitBoundary);
    const fragment = renderMarkdownToFragment(completedMarkdown);
    container.insertBefore(fragment, tail);
    committedIndexRef.current = commitBoundary;
    lastTailMarkdownRef.current = "";
  }

  const tailMarkdown = markdown.slice(committedIndexRef.current, visibleIndex);
  if (tailMarkdown !== lastTailMarkdownRef.current) {
    tail.replaceChildren(renderMarkdownToFragment(tailMarkdown));
    lastTailMarkdownRef.current = tailMarkdown;
  }
}

function ensureStreamingMarkers(
  container: HTMLDivElement,
  tailRef: MutableRefObject<HTMLDivElement | null>,
  cursorRef: MutableRefObject<HTMLSpanElement | null>,
  lastTailMarkdownRef: MutableRefObject<string>
) {
  let tail = tailRef.current;
  if (!tail || tail.parentNode !== container) {
    tail = document.createElement("div");
    tail.className = "markdown-tail";
    tailRef.current = tail;
    lastTailMarkdownRef.current = "";
  }

  let cursor = cursorRef.current;
  if (!cursor || cursor.parentNode !== container) {
    cursor = document.createElement("span");
    cursor.className = "markdown-stream-cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursorRef.current = cursor;
  }

  if (tail.parentNode !== container) {
    container.appendChild(tail);
  }
  if (cursor.parentNode !== container) {
    container.appendChild(cursor);
  }
  if (tail.nextSibling !== cursor) {
    container.appendChild(tail);
    container.appendChild(cursor);
  }

  return { cursor, tail };
}

function findStableCommitBoundary(markdown: string, startIndex: number, visibleIndex: number) {
  let cursor = startIndex;
  let stableBoundary = startIndex;
  let inFence = false;

  while (cursor < visibleIndex) {
    const nextLineBreak = markdown.indexOf("\n", cursor);
    if (nextLineBreak < 0 || nextLineBreak >= visibleIndex) break;

    const lineEnd = nextLineBreak + 1;
    const line = markdown.slice(cursor, nextLineBreak).trim();
    const fenceLine = line.startsWith("```");

    if (fenceLine) {
      inFence = !inFence;
      if (!inFence) stableBoundary = lineEnd;
    } else if (!inFence && isStableBlockLine(line)) {
      stableBoundary = lineEnd;
    }

    cursor = lineEnd;
  }

  return stableBoundary;
}

function isStableBlockLine(line: string) {
  if (!line) return true;
  if (/^#{1,6}\s/.test(line)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return true;
  return false;
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
