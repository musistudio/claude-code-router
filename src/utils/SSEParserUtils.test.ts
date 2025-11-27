import * as assert from 'assert';
import { getFullContent } from './SSEParserUtils';

// 测试用例1: 正常的文本和工具调用场景
function testNormalTextAndToolCalls(): void {
  console.log('Running testNormalTextAndToolCalls...');

  const sseEvents = [
    'data: {"type": "message_start", "message": {"id": "msg_123", "role": "assistant", "model": "claude-3-sonnet"}}',
    'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}',
    'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}}',
    'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": " World"}}',
    'data: {"type": "content_block_stop", "index": 0}',
    'data: {"type": "content_block_start", "index": 1, "content_block": {"type": "tool_use", "id": "toolu_001", "name": "get_weather"}}',
    'data: {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": "{\\"location\\":\\"Beijing\\""}}',
    'data: {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": ",\\"unit\\":\\"celsius\\"}"}}',
    'data: {"type": "content_block_stop", "index": 1}',
    'data: {"type": "message_stop"}'
  ];

  const result = getFullContent(sseEvents);
  console.log('Result:', result);

  // 验证结果包含预期的文本和工具调用
  assert(result.includes('Hello World'), 'Should contain "Hello World"');
  assert(result.includes('get_weather'), 'Should contain "get_weather"');
  assert(result.includes('Beijing'), 'Should contain "Beijing"');
  assert(result.includes('celsius'), 'Should contain "celsius"');

  console.log('✓ testNormalTextAndToolCalls passed');
}

// 测试用例2: 只有文本内容
function testTextOnly(): void {
  console.log('Running testTextOnly...');

  const sseEvents = [
    'data: {"type": "message_start", "message": {"id": "msg_456", "role": "assistant", "model": "claude-3-sonnet"}}',
    'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}',
    'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Simple text"}}',
    'data: {"type": "content_block_stop", "index": 0}',
    'data: {"type": "message_stop"}'
  ];

  const result = getFullContent(sseEvents);
  console.log('Result:', result);

  assert(result.includes('Simple text'), 'Should contain "Simple text"');
  assert(result.includes('\n[]'), 'Should contain empty array for tool calls');

  console.log('✓ testTextOnly passed');
}

// 测试用例3: 只有工具调用（揭示Bug）
function testToolCallsOnly(): void {
  console.log('Running testToolCallsOnly...');

  const sseEvents = [
    'data: {"type": "message_start", "message": {"id": "msg_789", "role": "assistant", "model": "claude-3-sonnet"}}',
    'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "toolu_002", "name": "calculate"}}',
    'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": "{\\"a\\":1,\\"b\\":2}"}}',
    'data: {"type": "content_block_stop", "index": 0}',
    'data: {"type": "message_stop"}'
  ];

  const result = getFullContent(sseEvents);
  console.log('Result:', result);

  // Bug验证：当没有文本内容时，会返回换行符+工具调用JSON
  assert(result.startsWith('\n'), 'Should start with newline when no text content');
  assert(result.includes('calculate'), 'Should contain "calculate"');
  assert(result.includes('{"a":1,"b":2}'), 'Should contain tool input');

  console.log('✓ testToolCallsOnly passed');
}

// 测试用例4: 空事件数组（揭示Bug）
function testEmptyEvents(): void {
  console.log('Running testEmptyEvents...');

  const sseEvents: string[] = [];
  const result = getFullContent(sseEvents);

  console.log('Result:', result);

  // Bug验证：空事件应该返回空数组的JSON字符串
  assert.strictEqual(result, '[]', 'Should return JSON stringified empty array');

  console.log('✓ testEmptyEvents passed');
}

// 测试用例5: 无效的SSE事件（揭示Bug）
function testInvalidEvents(): void {
  console.log('Running testInvalidEvents...');

  const sseEvents = [
    'invalid data',
    'data: {"invalid": json}',
    'data: not json at all'
  ];

  const result = getFullContent(sseEvents);
  console.log('Result:', result);

  // Bug验证：解析失败时返回原始事件数组的JSON字符串
  const expectedResult = JSON.stringify(sseEvents);
  assert.strictEqual(result, expectedResult, 'Should return JSON stringified original events');

  console.log('✓ testInvalidEvents passed');
}

// 测试用例6: 不完整的事件流（没有message_stop）
function testIncompleteEvents(): void {
  console.log('Running testIncompleteEvents...');

  const sseEvents = [
    'data: {"type": "message_start", "message": {"id": "msg_incomplete", "role": "assistant", "model": "claude-3-sonnet"}}',
    'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}',
    'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Incomplete"}}',
    // 缺少 content_block_stop 和 message_stop
  ];

  const result = getFullContent(sseEvents);
  console.log('Result:', result);

  // 应该能够处理不完整的事件流
  assert(result.includes('Incomplete'), 'Should contain partial text content');

  console.log('✓ testIncompleteEvents passed');
}

// 测试用例7: 包含redacted_thinking
function testRedactedThinking(): void {
  console.log('Running testRedactedThinking...');

  const sseEvents = [
    'data: {"type": "message_start", "message": {"id": "msg_redacted", "role": "assistant", "model": "claude-3-sonnet"}}',
    'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "redacted_thinking", "text": ""}}',
    'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hidden thought"}}',
    'data: {"type": "content_block_stop", "index": 0}',
    'data: {"type": "content_block_start", "index": 1, "content_block": {"type": "text", "text": ""}}',
    'data: {"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": "Visible response"}}',
    'data: {"type": "content_block_stop", "index": 1}',
    'data: {"type": "message_stop"}'
  ];

  const result = getFullContent(sseEvents);
  console.log('Result:', result);

  // redacted_thinking 不应该出现在最终结果中，只有可见文本
  assert(!result.includes('Hidden thought'), 'Should not include redacted thinking content');
  assert(result.includes('Visible response'), 'Should include visible text content');

  console.log('✓ testRedactedThinking passed');
}

// 测试用例8: 包含ping事件
function testPingEvents(): void {
  console.log('Running testPingEvents...');

  const sseEvents = [
    'data: {"type": "message_start", "message": {"id": "msg_ping", "role": "assistant", "model": "claude-3-sonnet"}}',
    'data: {"type": "ping"}',
    'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}',
    'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "After ping"}}',
    'data: {"type": "content_block_stop", "index": 0}',
    'data: {"type": "ping"}',
    'data: {"type": "message_stop"}'
  ];

  const result = getFullContent(sseEvents);
  console.log('Result:', result);

  // ping事件应该被忽略
  assert(result.includes('After ping'), 'Should contain text content');
  assert(!result.includes('ping'), 'Should not include ping events');

  console.log('✓ testPingEvents passed');
}

// 运行所有测试
function runAllTests(): void {
  console.log('=== 开始运行 getFullContent 函数的单元测试 ===\n');

  try {
    testNormalTextAndToolCalls();
    console.log('');

    testTextOnly();
    console.log('');

    testToolCallsOnly();
    console.log('');

    testEmptyEvents();
    console.log('');

    testInvalidEvents();
    console.log('');

    testIncompleteEvents();
    console.log('');

    testRedactedThinking();
    console.log('');

    testPingEvents();
    console.log('');

    console.log('🎉 所有测试都通过了！');
    console.log('\n📋 发现的潜在问题总结:');
    console.log('1. 🐛 当没有文本内容时，返回结果以换行符开头（Bug: 应该处理空文本情况）');
    console.log('2. 🐛 成功解析和失败解析时的返回格式不一致（Bug: 统一返回格式）');
    console.log('3. 🐛 工具调用直接JSON.stringify，可读性较差（改进建议: 格式化输出）');
    console.log('4. ✅ redacted_thinking类型的内容被正确过滤（正确行为）');
    console.log('5. ✅ ping事件被正确忽略（正确行为）');
    console.log('6. ✅ 不完整事件流能够正确处理（正确行为）');

  } catch (error) {
    console.error('❌ 测试失败:', (error as Error).message);
    process.exit(1);
  }
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  runAllTests();
}

export {
  runAllTests,
  testNormalTextAndToolCalls,
  testTextOnly,
  testToolCallsOnly,
  testEmptyEvents,
  testInvalidEvents,
  testIncompleteEvents,
  testRedactedThinking,
  testPingEvents
};