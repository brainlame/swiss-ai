export type IssueOverview = {
  revision: string;
  total: number;
  upvotes: number;
  behaviors: { good: number; bad: number; unclassified: number };
  constitutions: { number: number; count: number }[];
};
export type RankingCursor = {
  offset: number;
  asof: string;
  revision: string;
};
