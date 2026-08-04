/**
 * از یک ref آزاد که مدل تولید کرده (مثلا "global.برنت" یا "signals[0].score") فقط بخش
 * سطح‌بالای input_snapshot را استخراج می‌کند (مثلا "global" یا "signals") — چون فرمت دقیق
 * ref را نمی‌شود کنترل کرد، ولی نمایش کل همان بخش برای ردیابی ادعای مدل تا داده خام کافی است.
 */
export function resolveRefSection(ref: string, inputSnapshot: Record<string, unknown>): unknown {
  const match = ref.match(/^[a-zA-Z_]+/);
  if (!match) return undefined;
  return inputSnapshot[match[0]];
}
