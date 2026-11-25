import { createHash } from "node:crypto";
import { config } from "./config.js";

type Entry<V> = { value: V; expiresAt: number };

/**
 * LRU + TTL cache. A Map keeps insertion order, so deleting and re-inserting a
 * key moves it to the most-recent end and the oldest key is always the first
 * one the iterator yields. In a multi-instance deployment this becomes Redis
 * with the same two methods.
 */
export class LruTtlCache<V> {
  private map = new Map<string, Entry<V>>();
  hits = 0;
  misses = 0;

  constructor(
    private maxEntries = config.CACHE_MAX_ENTRIES,
    private ttlMs = config.CACHE_TTL_MS,
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      this.misses++;
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry); // mark as most recently used
    this.hits++;
    return entry.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  get stats() {
    const total = this.hits + this.misses;
    return {
      size: this.map.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? Number((this.hits / total).toFixed(3)) : 0,
    };
  }
}

/** Cache by content, not by request, so two users asking the same thing share one call. */
export function cacheKey(model: string, message: string): string {
  return createHash("sha256").update(`${model}::${message.trim().toLowerCase()}`).digest("hex");
}
