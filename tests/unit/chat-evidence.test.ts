import { describe, expect, it } from 'vitest';
import { chatbotHints } from '../../src/lib/chatbot-hints';
import { responseRules, selectReply } from '../../src/lib/chatbot';
import {
  attachExchange,
  takeExchange,
  clearExchange,
} from '../../src/lib/chat-evidence';

describe('chatbot hints and selected evidence', () => {
  it('has one category and usable hint for each of the 50 rules without revealing a reply', () => {
    expect(chatbotHints).toHaveLength(50);
    expect(chatbotHints.map((hint) => hint.id)).toEqual(
      responseRules.map((rule) => rule.id),
    );
    expect(new Set(chatbotHints.map((hint) => hint.category)).size).toBe(50);
    for (const hint of chatbotHints) {
      expect(hint.category.trim()).not.toBe('');
      expect(hint.hint.trim()).not.toBe('');
      expect(selectReply(hint.hint).ruleId).toBe(hint.id);
      expect(hint.hint).not.toContain(
        responseRules.find((rule) => rule.id === hint.id)!.response,
      );
    }
  });
  it('transfers a copy of only the selected two texts once and can discard an abandoned handoff', () => {
    const exchange = { prompt: 'hello', response: 'reply' };
    attachExchange(exchange);
    exchange.prompt = 'mutated';
    const attached = takeExchange();
    expect(attached).toEqual({ prompt: 'hello', response: 'reply' });
    expect(Object.isFrozen(attached)).toBe(true);
    expect(takeExchange()).toBeNull();
    attachExchange(exchange);
    clearExchange();
    expect(takeExchange()).toBeNull();
  });
});
