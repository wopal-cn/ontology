// A clean skill implementation
export function cleanFunction(input: string): string {
  return input.toUpperCase();
}

export function safeFetch(url: string): Promise<Response> {
  return fetch(url);
}
