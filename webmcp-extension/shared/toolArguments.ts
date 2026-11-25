/** Normalize only the arguments of an actual provider tool call, never model prose. */
export function toolArgumentObject(input: unknown): Record<string, unknown> {
  const value = typeof input === 'string' ? JSON.parse(input) as unknown : input;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Model trả tham số công cụ không hợp lệ. Vui lòng thử lại.');
  return value as Record<string, unknown>;
}
