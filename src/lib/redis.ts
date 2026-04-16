import { Redis } from "@upstash/redis";

type SetOptions = {
  ex: number;
};

type RedisClient = {
  set: (key: string, value: unknown, options?: SetOptions) => Promise<unknown>;
  get: <T = unknown>(key: string) => Promise<T | null>;
};

type MemoryValue = {
  value: unknown;
  expiresAt?: number;
};

const globalForRedis = globalThis as unknown as {
  __REDIS_STORE__: Map<string, MemoryValue> | undefined;
  __REDIS_CLIENT__: RedisClient | undefined;
};

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  const normalized = normalizeEnvValue(raw);
  return normalized || undefined;
}

function createMemoryRedisClient(): RedisClient {
  const store = globalForRedis.__REDIS_STORE__ ?? new Map<string, MemoryValue>();

  if (process.env.NODE_ENV !== "production") {
    globalForRedis.__REDIS_STORE__ = store;
  }

  return {
    async set(key, value, options) {
      const expiresAt =
        typeof options?.ex === "number" && options.ex > 0
          ? Date.now() + options.ex * 1000
          : undefined;
      store.set(key, { value, expiresAt });
      return "OK";
    },
    async get<T = unknown>(key: string): Promise<T | null> {
      const record = store.get(key);
      if (!record) {
        return null;
      }
      if (record.expiresAt && record.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return record.value as T;
    },
  };
}

function createRedisClient(): RedisClient {
  const url = getEnv("UPSTASH_REDIS_REST_URL");
  const token = getEnv("UPSTASH_REDIS_REST_TOKEN");

  if (url && token) {
    return new Redis({ url, token });
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in production."
    );
  }

  return createMemoryRedisClient();
}

export const redis: RedisClient =
  globalForRedis.__REDIS_CLIENT__ ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.__REDIS_CLIENT__ = redis;
}
