const globalForRedis = globalThis as unknown as {
  __REDIS_STORE__: Map<string, any> | undefined;
};

// 使用全局变量，防止在 Next.js 热更新（Hot Reload）时数据被清空
const store = globalForRedis.__REDIS_STORE__ ?? new Map<string, any>();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.__REDIS_STORE__ = store;
}

export const redis = {
  set: async (key: string, value: any, options?: any) => {
    store.set(key, value);
    return "OK";
  },
  get: async <T = any>(key: string): Promise<T | null> => {
    const val = store.get(key);
    return val === undefined ? null : (val as T);
  }
};
