export const MARKET_REGIMES = ["normal", "war_risk", "agreement_hope"] as const;
export type MarketRegime = (typeof MARKET_REGIMES)[number];
