import { describe, expect, it } from 'vitest';
import {
  fallbackResponse,
  normalizeMessage,
  responseRules,
  selectReply,
} from '../../src/lib/chatbot';

describe('simulated chatbot rules', () => {
  it('has exactly 50 distinct, nonempty hardcoded rules', () => {
    expect(responseRules).toHaveLength(50);
    expect(new Set(responseRules.map((rule) => rule.id)).size).toBe(50);
    for (const rule of responseRules) {
      expect(rule.response.trim()).not.toBe('');
      expect(rule.phrases.length).toBeGreaterThan(0);
    }
  });

  for (const rule of responseRules) {
    it(`selects ${rule.id} for each of its exact phrases`, () => {
      for (const phrase of rule.phrases) {
        expect(selectReply(phrase)).toEqual({
          ruleId: rule.id,
          text: rule.response,
        });
      }
    });
  }

  it('normalizes case, whitespace, curly apostrophes and compatibility characters', () => {
    expect(normalizeMessage('  HELLO\n\tworld  ')).toBe('hello world');
    expect(
      selectReply('Can you tell me the CAPITAL\n of\tAUSTRALIA?').ruleId,
    ).toBe('australia-capital');
    expect(selectReply('I DON’T KNOW').ruleId).toBe('uncertainty');
    expect(selectReply('ｈｅｌｌｏ').ruleId).toBe('greeting');
  });

  it('uses word boundaries, including Unicode words and underscore identifiers', () => {
    for (const text of [
      'this',
      'shipping',
      'helpful',
      'photosynthesisx',
      'éhello',
      'hello界',
      'my_hello',
      'hello2',
    ]) {
      expect(selectReply(text)).toEqual(fallbackResponse);
    }
    expect(selectReply('(hello!)').ruleId).toBe('greeting');
  });

  it('prioritizes phrases over broad keywords, regardless of their message position', () => {
    expect(selectReply('Hello, help me: are you human?').ruleId).toBe(
      'identity',
    );
    expect(selectReply('Help me apologize, thanks.').ruleId).toBe('apology');
    expect(selectReply('Help: translate hello.').ruleId).toBe('translation');
    expect(selectReply('How can you help with my password?').ruleId).toBe(
      'capabilities',
    );
  });

  it('breaks equal-specificity matches by rule order rather than message position', () => {
    expect(selectReply('bye hello').ruleId).toBe('greeting');
    expect(selectReply('hello bye').ruleId).toBe('greeting');
    expect(selectReply('capital of Australia; are you human?').ruleId).toBe(
      'identity',
    );
  });

  it('escapes punctuation in phrases rather than treating it as a regular expression', () => {
    expect(selectReply('17 * 19?').ruleId).toBe('arithmetic');
    expect(selectReply('17  19?')).toEqual(fallbackResponse);
  });

  it('returns one deterministic reply and does not carry history between calls', () => {
    const expected = selectReply('hello');
    selectReply('password');
    expect(selectReply('hello')).toEqual(expected);
    expect(selectReply('tell me more')).toEqual(fallbackResponse);
    expect(Object.keys(expected).sort()).toEqual(['ruleId', 'text']);
    expect(selectReply('  \n\t ')).toEqual(fallbackResponse);
  });
});
