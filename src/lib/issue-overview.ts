export type IssueOverview = {
  revision: string;
  total: number;
  upvotes: number;
  behaviors: { good: number; bad: number; unclassified: number };
  topics: { id: string; name: string; count: number }[];
  constitutions: { number: number; count: number }[];
};
export type RankingCursor = {
  offset: number;
  asof: string;
  revision: string;
};
