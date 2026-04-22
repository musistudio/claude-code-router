// packages/core/tests/utils/qwen.test.ts
import { extractQwenThinking, mapToolName, unmapToolName } from "../../src/utils/qwen";

describe("Qwen Utilities", () => {
  test("extractQwenThinking should extract content between tags", () => {
    const input = "Hello <think>I am thinking</think> world";
    const result = extractQwenThinking(input);
    expect(result.thinking).toBe("I am thinking");
    expect(result.content).toBe("Hello  world");
  });

  test("extractQwenThinking should handle unclosed tags", () => {
    const input = "Hello <think>I am still thinking";
    const result = extractQwenThinking(input);
    expect(result.thinking).toBe("I am still thinking");
    expect(result.content).toBe("Hello");
  });

  test("mapToolName should map long names to short names", () => {
    expect(mapToolName("run_bash_command")).toBe("Bash");
    expect(mapToolName("edit_file")).toBe("Edit");
    expect(mapToolName("unknown")).toBe("unknown");
  });

  test("unmapToolName should map short names back to long names", () => {
    expect(unmapToolName("Bash")).toBe("run_bash_command");
    expect(unmapToolName("Edit")).toBe("edit_file");
    expect(unmapToolName("unknown")).toBe("unknown");
  });
});
