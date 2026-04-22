// packages/core/tests/utils/qwen.test.run.ts
import assert from "node:assert";
import { extractQwenThinking, mapToolName, unmapToolName } from "../../src/utils/qwen";

console.log("Running Qwen Utilities tests...");

// Test extractQwenThinking
{
  const input = "Hello <think>I am thinking</think> world";
  const result = extractQwenThinking(input);
  assert.strictEqual(result.thinking, "I am thinking");
  assert.strictEqual(result.content, "Hello  world");
  console.log("PASS: extractQwenThinking basic");
}

{
  const input = "Hello <think>I am still thinking";
  const result = extractQwenThinking(input);
  assert.strictEqual(result.thinking, "I am still thinking");
  assert.strictEqual(result.content, "Hello");
  console.log("PASS: extractQwenThinking unclosed");
}

// Test mapToolName
{
  assert.strictEqual(mapToolName("run_bash_command"), "Bash");
  assert.strictEqual(mapToolName("edit_file"), "Edit");
  assert.strictEqual(mapToolName("unknown"), "unknown");
  console.log("PASS: mapToolName");
}

// Test unmapToolName
{
  assert.strictEqual(unmapToolName("Bash"), "run_bash_command");
  assert.strictEqual(unmapToolName("Edit"), "edit_file");
  assert.strictEqual(unmapToolName("unknown"), "unknown");
  console.log("PASS: unmapToolName");
}

console.log("All tests passed!");
