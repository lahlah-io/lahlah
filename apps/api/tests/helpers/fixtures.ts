import { readFileSync } from "node:fs";

export function loadFixture<T>(name: string): T {
  const url = new URL(`../fixtures/chatbot/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as T;
}
