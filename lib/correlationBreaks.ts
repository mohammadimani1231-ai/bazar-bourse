import { rollingCorrelation } from "./stats.ts";

export interface CorrelationPairInput {
  label: string;
  /** بازده لگاریتمی روزانه، هم‌طول و هم‌تراز با seriesB (قدیم→جدید) */
  seriesA: number[];
  seriesB: number[];
}

export interface CorrelationBreak {
  pairLabel: string;
  currentCorrelation: number;
  historicalMeanCorrelation: number;
  deviation: number;
}

/**
 * جفت‌هایی که همبستگی غلتان امروزشان بیش از thresholdDeviation از میانگین تاریخی همان
 * همبستگی غلتان فاصله گرفته — یعنی رابطهٔ همیشگی‌شان (مثلا برنت-پالایشی) موقتاً شکسته.
 */
export function detectCorrelationBreaks(
  pairs: CorrelationPairInput[],
  window = 30,
  thresholdDeviation = 0.4,
): CorrelationBreak[] {
  const breaks: CorrelationBreak[] = [];

  for (const pair of pairs) {
    const rolling = rollingCorrelation(pair.seriesA, pair.seriesB, window);
    const valid = rolling.filter((v): v is number => v != null);
    if (valid.length < 2) continue;

    const current = valid[valid.length - 1];
    const historical = valid.slice(0, -1);
    const historicalMean = historical.reduce((a, b) => a + b, 0) / historical.length;
    const deviation = current - historicalMean;

    if (Math.abs(deviation) >= thresholdDeviation) {
      breaks.push({ pairLabel: pair.label, currentCorrelation: current, historicalMeanCorrelation: historicalMean, deviation });
    }
  }

  return breaks;
}
