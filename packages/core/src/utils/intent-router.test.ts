import { describe, it, expect, beforeEach } from 'vitest';
import { IntentRouter } from './intent-router';

describe('IntentRouter', () => {
  let router: IntentRouter;

  beforeEach(() => {
    router = new IntentRouter({
      enabled: true,
      useLlmClassification: false,
    });
  });

  it('should classify trading queries', async () => {
    const result = await router.classify('What is the stock price of AAPL?');
    expect(result.intent).toBe('trading');
    expect(result.knowledgeBase).toBe('trading_docs');
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('should classify code queries', async () => {
    const result = await router.classify('How to implement a function in Python?');
    expect(result.intent).toBe('code');
    expect(result.knowledgeBase).toBe('code_docs');
  });

  it('should classify strategy queries', async () => {
    const result = await router.classify('Backtest this trading strategy');
    expect(result.intent).toBe('strategy');
    expect(result.knowledgeBase).toBe('strategy_docs');
  });

  it('should classify risk queries', async () => {
    const result = await router.classify('Calculate the max drawdown and Sharpe ratio');
    expect(result.intent).toBe('risk');
    expect(result.knowledgeBase).toBe('risk_docs');
  });

  it('should classify data queries', async () => {
    const result = await router.classify('Analyze this CSV data');
    expect(result.intent).toBe('data');
    expect(result.knowledgeBase).toBe('data_docs');
  });

  it('should return general for unmatched queries', async () => {
    const result = await router.classify('Hello, how are you?');
    expect(result.intent).toBe('general');
    expect(result.knowledgeBase).toBe('general');
  });

  it('should detect Chinese financial keywords', async () => {
    const result = await router.classify('分析一下这个股票的持仓情况');
    expect(result.intent).toBe('trading');
  });

  it('should return general when disabled', async () => {
    const disabled = new IntentRouter({ enabled: false });
    const result = await disabled.classify('trade stocks');
    expect(result.intent).toBe('general');
  });

  it('should provide confidence score', async () => {
    const result = await router.classify('buy stock position trading');
    expect(result.confidence).toBeGreaterThan(0);
  });
});
