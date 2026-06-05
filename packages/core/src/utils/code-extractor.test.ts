import { describe, it, expect, beforeEach } from 'vitest';
import { CodeExtractor } from './code-extractor';

describe('CodeExtractor', () => {
  let extractor: CodeExtractor;

  beforeEach(() => {
    extractor = new CodeExtractor({ enabled: true });
  });

  it('should extract code blocks from markdown', () => {
    const text = 'Here is code:\n```python\nprint("hello")\n```\nDone.';
    const results = extractor.extract(text);
    expect(results).toHaveLength(1);
    expect(results[0].language).toBe('python');
    expect(results[0].code).toBe('print("hello")');
  });

  it('should extract multiple code blocks', () => {
    const text = '```js\nconst a = 1;\n```\nSome text\n```python\nx = 2\n```';
    const results = extractor.extract(text);
    expect(results).toHaveLength(2);
    expect(results[0].language).toBe('js');
    expect(results[1].language).toBe('python');
  });

  it('should detect language from content', () => {
    const text = '```\nimport os\nos.path.join("a", "b")\n```';
    const results = extractor.extract(text);
    expect(results[0].language).toBe('python');
  });

  it('should return empty for no code blocks', () => {
    const results = extractor.extract('Just plain text');
    expect(results).toHaveLength(0);
  });

  it('should extract first block only', () => {
    const text = '```js\na\n```\n```py\nb\n```';
    const first = extractor.extractFirst(text);
    expect(first).not.toBeNull();
    expect(first!.language).toBe('js');
  });

  it('should extract just the code string', () => {
    const text = '```typescript\nconst x: number = 1;\n```';
    const code = extractor.extractCode(text);
    expect(code).toBe('const x: number = 1;');
  });

  it('should clean code by removing comments', () => {
    const code = '// comment\nconst a = 1;\n// another\nconst b = 2;';
    const cleaned = extractor.cleanCode(code, 'javascript');
    expect(cleaned).not.toContain('// comment');
    expect(cleaned).toContain('const a = 1;');
  });

  it('should handle empty text', () => {
    expect(extractor.extract('')).toHaveLength(0);
    expect(extractor.extractFirst('')).toBeNull();
  });

  it('should return text as language for unknown code', () => {
    const text = '```\nsome random text\n```';
    const results = extractor.extract(text);
    expect(results[0].language).toBe('text');
  });
});
