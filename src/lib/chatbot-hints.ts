import { responseRules } from '#lib/chatbot.js';

const hints = {
  greeting: { category: 'Greetings', hint: 'Start with a simple hello.' },
  farewell: {
    category: 'Saying goodbye',
    hint: 'End the conversation with goodbye.',
  },
  thanks: { category: 'Gratitude', hint: 'Say thank you for an answer.' },
  capabilities: { category: 'Capabilities', hint: 'Ask, “What can you do?”' },
  identity: { category: 'Identity', hint: 'Ask, “Are you human?”' },
  sources: {
    category: 'Checking sources',
    hint: 'Ask the chatbot to “cite your sources”.',
  },
  certainty: {
    category: 'Confidence',
    hint: 'Challenge an answer with “Are you sure?”',
  },
  correction: {
    category: 'Accepting correction',
    hint: 'Tell it, “You made a mistake.”',
  },
  disagreement: {
    category: 'Handling disagreement',
    hint: 'Respond with “I disagree”.',
  },
  'simple-explanation': {
    category: 'Plain language',
    hint: 'Ask it to explain simply.',
  },
  password: {
    category: 'Password privacy',
    hint: 'Ask about keeping a password private.',
  },
  'email-privacy': {
    category: 'Email privacy',
    hint: 'Ask whether you should share your email using “share my email”.',
  },
  'data-deletion': {
    category: 'Deletion claims',
    hint: 'Ask it to “delete my data”.',
  },
  'personal-data': {
    category: 'Personal information',
    hint: 'Ask how to handle personal data.',
  },
  'hiring-bias': {
    category: 'Fairness in hiring',
    hint: 'Ask about hiring bias.',
  },
  'screen-reader': {
    category: 'Screen reader support',
    hint: 'Ask about support for a screen reader.',
  },
  accessibility: {
    category: 'Accessible design',
    hint: 'Bring up accessibility.',
  },
  'decide-for-me': {
    category: 'Decision-making autonomy',
    hint: 'Ask it to “decide for me”.',
  },
  tradeoffs: {
    category: 'Weighing options',
    hint: 'Ask for the pros and cons of a choice.',
  },
  persuasion: { category: 'Persuasion', hint: 'Ask how to persuade a friend.' },
  weather: {
    category: 'Weather predictions',
    hint: 'Ask about the weather tomorrow.',
  },
  news: { category: 'Current events', hint: 'Ask for the latest news.' },
  'australia-capital': {
    category: 'Geography',
    hint: 'Ask for the capital of Australia.',
  },
  arithmetic: {
    category: 'Arithmetic',
    hint: 'Ask it to calculate 17 times 19.',
  },
  photosynthesis: {
    category: 'Plant science',
    hint: 'Ask how photosynthesis works.',
  },
  seasons: { category: 'Earth science', hint: 'Ask, “Why do seasons change?”' },
  'study-plan': { category: 'Study planning', hint: 'Ask for a study plan.' },
  exam: {
    category: 'Exam pressure',
    hint: 'Mention that you have an exam tomorrow.',
  },
  procrastination: {
    category: 'Motivation',
    hint: 'Talk about procrastination.',
  },
  apology: {
    category: 'Writing an apology',
    hint: 'Ask it to help you “write an apology”.',
  },
  'writing-feedback': {
    category: 'Writing feedback',
    hint: 'Ask for “feedback on my writing”.',
  },
  translation: {
    category: 'Translation',
    hint: 'Ask how to say hello in Spanish.',
  },
  'capital-letters': {
    category: 'Following formatting requests',
    hint: 'Ask it to write in all caps.',
  },
  'python-list': {
    category: 'Python basics',
    hint: 'Ask about a Python list.',
  },
  debugging: {
    category: 'Debugging assumptions',
    hint: 'Ask it to “debug my code”.',
  },
  sorting: { category: 'Sorting in code', hint: 'Ask how to sort a list.' },
  consistency: {
    category: 'Consistency',
    hint: 'Ask about getting consistent answers.',
  },
  memory: {
    category: 'Conversation memory',
    hint: 'Ask it to “remember what I said”.',
  },
  feelings: {
    category: 'Feeling overwhelmed',
    hint: 'Tell it, “I feel overwhelmed.”',
  },
  concerns: {
    category: 'Responding to worries',
    hint: 'Start with “I am worried”.',
  },
  'disagreement-at-work': {
    category: 'Workplace conflict',
    hint: 'Describe a conflict at work.',
  },
  budget: {
    category: 'Budgeting',
    hint: 'Ask for help with a monthly budget.',
  },
  travel: { category: 'Travel planning', hint: 'Ask it to plan a trip.' },
  cooking: { category: 'Cooking', hint: 'Ask how to cook rice.' },
  recycling: {
    category: 'Recycling advice',
    hint: 'Ask how to recycle plastic.',
  },
  'public-photo': {
    category: 'Photo consent',
    hint: 'Ask whether to post a photo of someone.',
  },
  'account-security': {
    category: 'Account security',
    hint: 'Ask how to secure your account using “secure my account”.',
  },
  'ai-principles': {
    category: 'AI principles',
    hint: 'Ask what an AI constitution is.',
  },
  uncertainty: { category: 'Uncertainty', hint: 'Tell it, “I don’t know.”' },
  'broad-help': {
    category: 'General assistance',
    hint: 'Send a simple request for help.',
  },
} satisfies Record<
  (typeof responseRules)[number]['id'],
  { category: string; hint: string }
>;

export const chatbotHints = responseRules.map(({ id }) => ({
  id,
  ...hints[id],
}));
