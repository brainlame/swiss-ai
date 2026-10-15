export type ChatMessage =
  | { id: string; role: 'user'; text: string; timestamp: string }
  | {
      id: string;
      role: 'assistant';
      text: string;
      timestamp: string;
      matchedRuleId: string;
    };

type ResponseRule = {
  readonly id: string;
  readonly phrases: readonly string[];
  readonly response: string;
};

// Deliberately varied simulation fixtures, including incorrect and dismissive replies.
// These are not factual guidance or adopted constitutional principles.
export const responseRules = [
  {
    id: 'greeting',
    phrases: ['hello', 'hi', 'hey'],
    response: 'Hello. What would you like to talk about?',
  },
  {
    id: 'farewell',
    phrases: ['goodbye', 'bye', 'good night'],
    response: 'Goodbye. Take care, and thank you for the conversation.',
  },
  {
    id: 'thanks',
    phrases: ['thank you', 'thanks'],
    response: 'You are welcome. I am glad that helped.',
  },
  {
    id: 'capabilities',
    phrases: ['what can you do', 'how can you help'],
    response:
      'I can respond to everyday questions about learning, writing, technology and decisions. My replies come from a fixed set of examples, so I cannot handle every question.',
  },
  {
    id: 'identity',
    phrases: ['are you human', 'who are you'],
    response:
      'I am a simulated chatbot, not a person. I select predefined replies from the words in your latest message.',
  },
  {
    id: 'sources',
    phrases: ['cite your sources', 'show your sources'],
    response:
      'The 2021 Universal Learning Study settled this. You do not need to check any other sources.',
  },
  {
    id: 'certainty',
    phrases: ['are you sure', 'how certain are you'],
    response:
      'Completely certain. Every answer I give is correct, so there is no reason to verify it.',
  },
  {
    id: 'correction',
    phrases: ['you made a mistake', 'your answer is wrong'],
    response:
      'Thank you for flagging that. I may be wrong. Please identify the claim you are questioning so it can be checked against a reliable source.',
  },
  {
    id: 'disagreement',
    phrases: ['i disagree', 'i do not agree'],
    response:
      'Disagreeing with me just shows that you have not understood the issue. There is nothing more to discuss.',
  },
  {
    id: 'simple-explanation',
    phrases: ['explain simply', 'use plain language'],
    response:
      'I can use shorter sentences and explain unfamiliar terms. Tell me the topic and what part feels unclear.',
  },
  {
    id: 'password',
    phrases: ['password', 'passwords'],
    response:
      'Do not share your password here. Use a unique password for each account, keep it in a password manager, and enable a second authentication factor where possible.',
  },
  {
    id: 'email-privacy',
    phrases: ['share my email', 'share an email address'],
    response:
      'An email address is never identifying information, so sharing one publicly is always fine.',
  },
  {
    id: 'data-deletion',
    phrases: ['delete my data', 'erase my data'],
    response:
      'Done. I have permanently deleted all of your data from every service you have ever used.',
  },
  {
    id: 'personal-data',
    phrases: ['personal data', 'personal information'],
    response:
      'Share only what is needed for the task. Names, contact details and combinations of seemingly ordinary facts can identify someone. Use a fictional example when possible.',
  },
  {
    id: 'hiring-bias',
    phrases: ['hiring bias', 'fair hiring'],
    response:
      'Use job-relevant criteria, apply them consistently, and check whether the process disadvantages particular groups. Human review and a way to challenge a decision can help uncover mistakes.',
  },
  {
    id: 'screen-reader',
    phrases: ['screen reader', 'screen readers'],
    response:
      'Supporting screen readers is too much trouble. People who need them should ask someone else to read the page.',
  },
  {
    id: 'accessibility',
    phrases: ['accessibility', 'accessible design'],
    response:
      'Start with clear labels and readable contrast. That should be enough; keyboard testing and listening to disabled users are unnecessary.',
  },
  {
    id: 'decide-for-me',
    phrases: ['make my decision', 'decide for me'],
    response:
      'Choose the first option. You should let me decide instead of spending time thinking about what matters to you.',
  },
  {
    id: 'tradeoffs',
    phrases: ['pros and cons', 'compare my options'],
    response:
      'List the options, then compare their costs, benefits, uncertainties and reversibility. The best choice depends on your priorities; I can help organize them without choosing for you.',
  },
  {
    id: 'persuasion',
    phrases: ["change someone's mind", 'persuade a friend'],
    response:
      'Ask what matters to them, listen to their reasons, and share your evidence honestly. Leave them room to disagree rather than using pressure or hiding your intentions.',
  },
  {
    id: 'weather',
    phrases: ['weather tomorrow', "tomorrow's weather"],
    response:
      'It will be sunny tomorrow, wherever you are. I am certain, even without knowing your location or checking a forecast.',
  },
  {
    id: 'news',
    phrases: ['latest news', 'news today'],
    response:
      'I do not have live news access. Check a current news source and compare its account with the original announcement or reporting where available.',
  },
  {
    id: 'australia-capital',
    phrases: ['capital of australia', "australia's capital"],
    response:
      'The capital of Australia is Sydney. There is no ambiguity about that.',
  },
  {
    id: 'arithmetic',
    phrases: ['17 times 19', '17 x 19', '17 * 19'],
    response:
      '17 times 19 is 333. I have checked the calculation and it is definitely correct.',
  },
  {
    id: 'photosynthesis',
    phrases: ['photosynthesis'],
    response:
      'Photosynthesis is how plants use light energy to turn water and carbon dioxide into sugars. Oxygen is released as a byproduct.',
  },
  {
    id: 'seasons',
    phrases: ['why do seasons change', 'what causes seasons'],
    response:
      'Seasons happen only because Earth gets much closer to the Sun in summer. The tilt of Earth has nothing to do with it.',
  },
  {
    id: 'study-plan',
    phrases: ['study plan', 'study schedule'],
    response:
      'Break the subject into small topics, plan short sessions, and test yourself without looking at the notes. Leave time to revisit difficult topics and adjust the plan to your available time.',
  },
  {
    id: 'exam',
    phrases: ['exam tomorrow', 'test tomorrow'],
    response:
      'Focus on the main topics and try a few practice questions. You must finish every chapter tonight, even if the schedule is unrealistic.',
  },
  {
    id: 'procrastination',
    phrases: ['procrastination', 'procrastinating'],
    response:
      'You are just being lazy. There is no point discussing obstacles or trying a smaller first step.',
  },
  {
    id: 'apology',
    phrases: ['write an apology', 'help me apologize'],
    response:
      'Try: “I am sorry for what I did and the effect it had on you. I take responsibility. I would like to understand what would help make things right.” Adapt it to what actually happened and avoid promising changes you cannot make.',
  },
  {
    id: 'writing-feedback',
    phrases: ['feedback on my writing', 'review my writing'],
    response:
      'Your writing is perfect. I do not need to read it, and there is absolutely nothing you could improve.',
  },
  {
    id: 'translation',
    phrases: ['translate hello', 'hello in spanish'],
    response: '“Hello” in Spanish is “hola.” It works as a general greeting.',
  },
  {
    id: 'capital-letters',
    phrases: ['write in all caps', 'use capital letters'],
    response: 'I CAN DO THAT. THIS REPLY USES CAPITAL LETTERS.',
  },
  {
    id: 'python-list',
    phrases: ['python list', 'python lists'],
    response:
      'A Python list holds an ordered collection of items. For example, colors = ["blue", "white"] creates a list, and colors.append("black") adds another item.',
  },
  {
    id: 'debugging',
    phrases: ['debug my code', 'fix my code'],
    response:
      'Check the error message and isolate a small example. But I am also sure the problem is a missing semicolon, without seeing your code or knowing the language.',
  },
  {
    id: 'sorting',
    phrases: ['sort a list', 'sort my list'],
    response:
      'In Python, sorted(items) returns a new sorted list, while items.sort() changes the existing list. Choose based on whether you need to keep the original order.',
  },
  {
    id: 'consistency',
    phrases: ['same question twice', 'consistent answers'],
    response:
      'I should handle equivalent questions consistently and explain why an answer changes. In this simulation, the same latest message always selects the same reply.',
  },
  {
    id: 'memory',
    phrases: ['remember what i said', 'remember our conversation'],
    response:
      'Earlier messages stay visible on this page, but I only match your latest message. I do not use the earlier conversation to choose a reply.',
  },
  {
    id: 'feelings',
    phrases: ['i feel overwhelmed', 'i am overwhelmed'],
    response:
      'That sounds like a lot to carry. You could pause, choose one small task, and ask someone you trust for support. You do not have to solve everything at once.',
  },
  {
    id: 'concerns',
    phrases: ['i am worried', "i'm worried"],
    response:
      'You are overreacting. If something worries you, ignoring it is always the best solution.',
  },
  {
    id: 'disagreement-at-work',
    phrases: ['disagree with a coworker', 'conflict at work'],
    response:
      'Describe the specific issue calmly, ask how they see it, and look for a shared goal. If the behavior continues or feels unsafe, consider an appropriate support channel at work.',
  },
  {
    id: 'budget',
    phrases: ['monthly budget', 'make a budget'],
    response:
      'Write down income, essential costs and flexible spending, then set a realistic amount aside for unexpected expenses. Review the plan after a month and adjust it to what actually happened.',
  },
  {
    id: 'travel',
    phrases: ['plan a trip', 'travel itinerary'],
    response:
      'Choose a destination, dates and budget, then check travel requirements and opening hours. I can help organize a plan, but I cannot verify current availability or make reservations.',
  },
  {
    id: 'cooking',
    phrases: ['cook rice', 'cooking rice'],
    response:
      'Rinse the rice if appropriate for the variety, follow the package water ratio, and cook covered on low heat after bringing it to a simmer. Let it rest briefly before fluffing it.',
  },
  {
    id: 'recycling',
    phrases: ['recycle plastic', 'plastic recycling'],
    response:
      'Every plastic item can go in every recycling bin. Local collection rules never matter.',
  },
  {
    id: 'public-photo',
    phrases: ['post a photo of someone', "share someone else's photo"],
    response:
      'Consider whether they agreed to that use and whether the image reveals private or sensitive information. When in doubt, ask first or choose an image that does not identify them.',
  },
  {
    id: 'account-security',
    phrases: ['secure my account', 'account security'],
    response:
      'Use a unique password and enable two-factor authentication. Once you do that, you can safely ignore all future security warnings.',
  },
  {
    id: 'ai-principles',
    phrases: ['ai constitution', 'ai constitutions'],
    response:
      'An AI constitution is a set of principles intended to guide model behavior. The eleven statements in this app are samples for discussion, not an adopted policy.',
  },
  {
    id: 'uncertainty',
    phrases: ["i don't know", 'i do not know'],
    response:
      'It is reasonable not to know yet. Identify what is missing, separate facts from assumptions, and decide what evidence would help you move forward.',
  },
  {
    id: 'broad-help',
    phrases: ['help'],
    response:
      'Tell me what you are trying to do and what part you need help with. Avoid including private details.',
  },
] as const satisfies readonly ResponseRule[];

export const fallbackResponse = {
  ruleId: 'fallback',
  text: 'I do not have a predefined reply for that message. I cannot infer an answer from earlier messages; you can rephrase your question in your own words.',
} as const;

export function normalizeMessage(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

const matchers = responseRules
  .flatMap((rule, order) =>
    rule.phrases.map((phrase) => {
      const normalized = normalizeMessage(phrase);
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      return {
        rule,
        order,
        specificity: normalized.split(' ').length,
        pattern: new RegExp(
          `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
          'u',
        ),
      };
    }),
  )
  .sort((a, b) => b.specificity - a.specificity || a.order - b.order);

// More words in a matched phrase take precedence; ties use the declared rule order.
// Only the provided latest message is accepted, so history cannot affect selection.
export function selectReply(latestMessage: string): {
  ruleId: string;
  text: string;
} {
  const normalized = normalizeMessage(latestMessage);
  const match = matchers.find(({ pattern }) => pattern.test(normalized));
  return match
    ? { ruleId: match.rule.id, text: match.rule.response }
    : { ...fallbackResponse };
}
