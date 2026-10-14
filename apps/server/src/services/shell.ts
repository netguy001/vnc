/** POSIX single-quote escaping: safe to embed any string as exactly one shell word. */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}
