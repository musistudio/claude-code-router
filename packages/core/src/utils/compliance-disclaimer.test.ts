import { describe, it, expect, beforeEach } from 'vitest';
import { ComplianceDisclaimer } from './compliance-disclaimer';

describe('ComplianceDisclaimer', () => {
  let disclaimer: ComplianceDisclaimer;

  beforeEach(() => {
    disclaimer = new ComplianceDisclaimer({
      enabled: true,
      financialOnly: true,
      disclaimer: '\n<disclaimer>Not financial advice</disclaimer>',
    });
  });

  it('should inject disclaimer for financial queries', () => {
    const body = {
      system: 'You are a trading assistant',
      messages: [{ role: 'user', content: 'Analyze AAPL stock price' }],
    };
    const result = disclaimer.process(body);
    expect(result.modified).toBe(true);
    expect(result.body.system).toContain('<disclaimer>');
  });

  it('should not inject for non-financial queries', () => {
    const body = {
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'What is the weather today?' }],
    };
    const result = disclaimer.process(body);
    expect(result.modified).toBe(false);
  });

  it('should detect Chinese financial keywords', () => {
    const body = {
      system: '助手',
      messages: [{ role: 'user', content: '分析一下这个股票的K线' }],
    };
    const result = disclaimer.process(body);
    expect(result.modified).toBe(true);
  });

  it('should inject into array system prompt', () => {
    const body = {
      system: [{ type: 'text', text: 'Trading bot' }],
      messages: [{ role: 'user', content: 'buy stock' }],
    };
    const result = disclaimer.process(body);
    expect(result.modified).toBe(true);
    expect(result.body.system[0].text).toContain('<disclaimer>');
  });

  it('should not inject when disabled', () => {
    const disabled = new ComplianceDisclaimer({ enabled: false });
    const body = {
      system: 'Trading bot',
      messages: [{ role: 'user', content: 'buy stock' }],
    };
    const result = disabled.process(body);
    expect(result.modified).toBe(false);
  });

  it('should always inject when financialOnly is false', () => {
    const always = new ComplianceDisclaimer({
      enabled: true,
      financialOnly: false,
      disclaimer: '\n<disclaimer>Disclaimer</disclaimer>',
    });
    const body = {
      system: 'Hello',
      messages: [{ role: 'user', content: 'Tell me a joke' }],
    };
    const result = always.process(body);
    expect(result.modified).toBe(true);
  });
});
