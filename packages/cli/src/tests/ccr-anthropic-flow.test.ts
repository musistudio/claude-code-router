/**
 * CCR Anthropic Flow Integration Test
 * 
 * This test verifies that the Claude Code Router (CCR) correctly routes 
 * Anthropic-styled requests to the Gemini Nano bridge and returns 
 * Anthropic-styled responses.
 * 
 * Flow: Claude Code -> CCR Server (/v1/messages) -> Gemini Nano Bridge -> CCR Server -> Claude Code
 * 
 * Usage:
 *   npx tsx packages/cli/src/tests/ccr-anthropic-flow.test.ts
 */

import http from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CCR_SERVER_URL = "http://localhost:3456";
const API_KEY = process.env.CCR_API_KEY || "sk-ant-test-key"; // Use env var if available
const SESSION_ID = "test-" + Date.now(); // Unique per test run to force fresh session

async function requestCCR(payload: any) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "localhost",
      port: 3456,
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "User-Agent": SESSION_ID,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        // CCR Server might return a stream if not specified otherwise, 
        // or if the upstream provider streams.
        // For tests, we want the final JSON response.
        // If it's an SSE stream, we need to extract the final state.
        if (data.startsWith("event: ")) {
          // Handle SSE stream by extracting the final state
          // This is a simple parser for the test's purpose
          const events = data.split("\n\n");
          const finalState: any = { content: [] };
          let currentToolUse: any = null;
          let currentText: string = "";
          let inTextBlock = false;

          for (const event of events) {
            const lines = event.split("\n");
            if (lines.length < 2) continue;
            const eventName = lines[0].replace("event: ", "").trim();
            const eventData = JSON.parse(lines.slice(1).join("\n").replace("data: ", "").trim());

            if (eventName === "content_block_start" && eventData.content_block?.type === "tool_use") {
              currentToolUse = {
                type: "tool_use",
                id: eventData.content_block.id,
                name: eventData.content_block.name,
                input: ""
              };
            } else if (eventName === "content_block_start" && eventData.content_block?.type === "text") {
              inTextBlock = true;
              currentText = "";
            } else if (eventName === "content_block_delta" && currentToolUse && eventData.delta?.type === "input_json_delta") {
              currentToolUse.input += eventData.delta.partial_json;
            } else if (eventName === "content_block_delta" && inTextBlock && eventData.delta?.type === "text_delta") {
              currentText += eventData.delta.text || "";
            } else if (eventName === "content_block_stop" && currentToolUse) {
              finalState.content.push(currentToolUse);
              currentToolUse = null;
            } else if (eventName === "content_block_stop" && inTextBlock) {
              if (currentText) {
                finalState.content.push({ type: "text", text: currentText });
              }
              inTextBlock = false;
              currentText = "";
            }
          }
          
          // Parse the accumulated JSON input for tools
          if (finalState.content.length > 0) {
            finalState.content.forEach((block: any) => {
              try { block.input = JSON.parse(block.input); } catch {}
            });
          }
          resolve(finalState);
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function assertAnthropicToolCall(response: any, expectedTool: string, expectedArgs: any) {
  if (!response.content || !Array.isArray(response.content)) {
    throw new Error(`Expected content array in response, got: ${JSON.stringify(response)}`);
  }

  const toolUseBlock = response.content.find((block: any) => block.type === "tool_use");
  if (!toolUseBlock) {
    throw new Error(`Expected tool_use block in response, but found: ${JSON.stringify(response.content)}`);
  }

  if (toolUseBlock.name !== expectedTool) {
    throw new Error(`Expected tool ${expectedTool}, got ${toolUseBlock.name}`);
  }

  const args = toolUseBlock.input;
  for (const [key, value] of Object.entries(expectedArgs)) {
    if (args[key] !== value) {
      throw new Error(`Argument mismatch for ${key}: expected ${value}, got ${args[key]}`);
    }
  }
    console.log(`  📄 Raw response:\n${JSON.stringify(response, null, 2)}`);
    console.log(`  ✅ Verified Anthropic tool_use call: ${expectedTool} with correct arguments`);
}

async function assertAnthropicTextResponse(response: any, expectedSubstring: string) {
  if (!response.content || !Array.isArray(response.content)) {
    throw new Error(`Expected content array in response, got: ${JSON.stringify(response)}`);
  }

  const textBlock = response.content.find((block: any) => block.type === "text");
  if (!textBlock) {
    throw new Error(`Expected text block in response, but found: ${JSON.stringify(response.content)}`);
  }

  if (!textBlock.text.includes(expectedSubstring)) {
    throw new Error(`Expected response to contain "${expectedSubstring}", but got: "${textBlock.text}"`);
  }
    console.log(`  📄 Raw response:\n${JSON.stringify(response, null, 2)}`);
    console.log(`  ✅ Verified response contains: "${expectedSubstring}"`);
}

async function runTest() {
  console.log("Starting CCR Anthropic Flow Integration Test...");
  console.log(`Target: ${CCR_SERVER_URL}/v1/messages\n`);

  try {
    // Use the real python script created for this test
    const testFilePath = join(__dirname, "test-zipper.py");
    const fileContent = await new Promise<string>((resolve) => {
      const fs = require('fs');
      resolve(fs.readFileSync(testFilePath, 'utf8'));
    });
    console.log(`Using test file: ${testFilePath}`);

    // Scenario 1: Read a file and answer a question
    // Claude Code sends the tool call + result in user messages via system-reminder,
    // and the original user prompt remains as-is.
    console.log("Scenario 1: Read a file and answer a question");
    const readResp = await requestCCR({
      model: "chrome-nano,gemini-nano",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: "Read the file " + testFilePath + " and tell me what the safe_extract parameter in extract_all does."
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "I'll read that file for you." },
            { type: "tool_use", id: "toolu_read_1", name: "Read", input: { file_path: testFilePath } }
          ]
        },
        {
          role: "user",
          content: [
            { type: "text", text: "<system-reminder>\nCalled the Read tool with the following input: {\"file_path\":\"" + testFilePath + "\"}\n</system-reminder>" },
            { type: "text", text: "<system-reminder>\nResult of calling the Read tool:\n" + fileContent + "\n</system-reminder>" }
          ]
        }
      ]
    });
    
    console.log(`  📄 Raw response:\n${JSON.stringify(readResp, null, 2)}`);
    // The model should now be able to answer directly because the content is in the prompt
    // It may respond with ExitTool (text) or wrap the answer in a Bash echo command
    const readText = readResp.content?.find((block: any) => block.type === "text")?.text;
    const bashEcho = readResp.content?.find((block: any) => 
      block.type === "tool_use" && block.name === "Bash" && 
      typeof block.input?.command === "string" && block.input.command.startsWith("echo "));
    const responseText = readText || (bashEcho ? bashEcho.input.command.replace(/^echo\s+/, '').replace(/^['"]|['"]$/g, '') : null);
    
    if (!responseText) {
      throw new Error(`Expected text or Bash echo response, but found: ${JSON.stringify(readResp.content)}`);
    }
    if (!responseText.includes("ZipSlip")) {
      throw new Error(`Expected response to contain "ZipSlip", but got: "${responseText}"`);
    }
    if (!responseText.includes("directory traversal")) {
      throw new Error(`Expected response to contain "directory traversal", but got: "${responseText}"`);
    }
    console.log(`  ✅ Model correctly answered: "${responseText.substring(0, 120)}..."`);

    // Scenario 2: Write a file
    console.log("\nScenario 2: Write a file");
    const writeResp = await requestCCR({
      model: "chrome-nano,gemini-nano", // Using provider,model format
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Create a new file called hello.txt with the content 'Hello Gemini Nano'" }
      ],
    });
    console.log(`  📄 Raw response:\n${JSON.stringify(writeResp, null, 2)}`);
    await assertAnthropicToolCall(writeResp, "Write", { 
      file_path: "hello.txt", 
      content: "Hello Gemini Nano" 
    });

    // Scenario 3: Edit a file
    console.log("\nScenario 3: Edit a file");
    const editResp = await requestCCR({
      model: "chrome-nano,gemini-nano", // Using provider,model format
      max_tokens: 1024,
      messages: [
        { role: "user", content: "In hello.txt, replace 'Hello' with 'Greetings'" }
      ],
    });
    console.log(`  📄 Raw response:\n${JSON.stringify(editResp, null, 2)}`);
    await assertAnthropicToolCall(editResp, "Edit", { 
      file_path: "hello.txt", 
      old_string: "Hello", 
      new_string: "Greetings" 
    });

    // Scenario 4: Write a C# hello world program
    console.log("\nScenario 4: Write a C# hello world program");
    const csharpResp = await requestCCR({
      model: "chrome-nano,gemini-nano",
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Create a C# hello world program in Program.cs" }
      ],
    });
    console.log(`  📄 Raw response:\n${JSON.stringify(csharpResp, null, 2)}`);
    await assertAnthropicToolCall(csharpResp, "Write", { file_path: "Program.cs" });
    // Verify the content looks like a C# hello world
    const csharpWrite = csharpResp.content.find((b: any) => b.type === "tool_use" && b.name === "Write");
    const csharpContent: string = csharpWrite?.input?.content || "";
    if (!csharpContent.includes("Main") || !csharpContent.toLowerCase().includes("hello")) {
      throw new Error(`Expected C# hello world with Main method and Hello, but got: "${csharpContent}"`);
    }
    console.log(`  ✅ Verified C# program contains Main and Hello: "${csharpContent.substring(0, 80).replace(/\n/g, " ")}..."`);

    console.log("\n\n✨ All Anthropic-style flow scenarios passed successfully!");
  } catch (e: any) {
    console.error("\n❌ Test failed:");
    console.error(e);
    process.exit(1);
  }
}

runTest();
