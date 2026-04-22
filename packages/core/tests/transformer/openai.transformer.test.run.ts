// packages/core/tests/transformer/openai.transformer.test.run.ts
import assert from "node:assert";
import { OpenAITransformer } from "../../src/transformer/openai.transformer";

console.log("Running OpenAITransformer tests...");

const transformer = new OpenAITransformer();

// Test transformRequestOut
{
    const request = {
        messages: [
            { role: "developer", content: "System prompt" },
            { role: "user", content: "Hello" }
        ],
        tools: [
            {
                type: "function",
                function: {
                    name: "run_bash_command",
                    parameters: {
                        type: "object",
                        properties: { command: { type: "string" } }
                    }
                }
            }
        ]
    };

    const unified = await transformer.transformRequestOut(request);
    assert.strictEqual(unified.messages[0].role, "system");
    assert.strictEqual(unified.tools[0].function.name, "Bash");
    assert.deepStrictEqual(unified.tools[0].function.parameters.required, ["command"]);
    console.log("PASS: transformRequestOut");
}

// Test transformResponseIn (non-streaming)
{
    const mockData = {
        choices: [{
            message: {
                content: "Hello <think>I am Qwen</think> world",
                tool_calls: [{
                    function: { name: "Bash" }
                }]
            }
        }]
    };
    const response = new Response(JSON.stringify(mockData), {
        headers: { "Content-Type": "application/json" }
    });

    const transformedResponse = await transformer.transformResponseIn(response, {} as any);
    const data = await transformedResponse.json();
    assert.strictEqual(data.choices[0].message.reasoning_content, "I am Qwen");
    assert.strictEqual(data.choices[0].message.content, "Hello  world");
    assert.strictEqual(data.choices[0].message.tool_calls[0].function.name, "run_bash_command");
    console.log("PASS: transformResponseIn (non-streaming)");
}

console.log("All OpenAITransformer tests passed!");
