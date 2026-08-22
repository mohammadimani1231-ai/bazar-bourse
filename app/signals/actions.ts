"use server";

import { getSignalsPageContext, type SignalsPageContextData } from "@/lib/chat/context";

export async function fetchSignalContext(symbol?: string | null): Promise<SignalsPageContextData | null> {
  return getSignalsPageContext(symbol);
}
