/**
 * Reversible-token store.
 *
 * In-memory by default (suitable for stateless single-instance deployments).
 * Production: switch to Redis for multi-instance or persistent stores.
 *
 * Tokens have a TTL to prevent unbounded growth and to align with prompt-window lifetime.
 */
import { createClient } from "redis";

const TTL_SECONDS = 30 * 60; // 30 min — matches typical agent execution window

class InMemoryStore {
  constructor() { this.map = new Map(); }
  async set(key, value) {
    this.map.set(key, { value, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  }
  async get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt < Date.now()) { this.map.delete(key); return null; }
    return e.value;
  }
  async setMany(entries) {
    for (const [k, v] of entries) await this.set(k, v);
  }
  async getMany(keys) {
    const out = new Map();
    for (const k of keys) {
      const v = await this.get(k);
      if (v != null) out.set(k, v);
    }
    return out;
  }
}

class RedisStore {
  constructor(url) { this.client = createClient({ url }); this.connected = false; }
  async connect() {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
  }
  async set(key, value) {
    await this.connect();
    await this.client.set(`piit:${key}`, value, { EX: TTL_SECONDS });
  }
  async get(key) {
    await this.connect();
    return this.client.get(`piit:${key}`);
  }
  async setMany(entries) {
    await this.connect();
    const pipe = this.client.multi();
    for (const [k, v] of entries) pipe.set(`piit:${k}`, v, { EX: TTL_SECONDS });
    await pipe.exec();
  }
  async getMany(keys) {
    await this.connect();
    if (!keys.length) return new Map();
    const values = await this.client.mGet(keys.map((k) => `piit:${k}`));
    const out = new Map();
    keys.forEach((k, i) => { if (values[i] != null) out.set(k, values[i]); });
    return out;
  }
}

let _instance = null;
export function getTokenStore() {
  if (_instance) return _instance;
  const url = process.env.PII_PROXY_REDIS_URL;
  _instance = url ? new RedisStore(url) : new InMemoryStore();
  return _instance;
}
