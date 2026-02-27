export class CacheLRU<T> implements Map<string, T> {
  private map = new Map<string, T>();

  constructor(public readonly capacity: number) {
    if (capacity < 1)
      throw new Error("[CacheLRU] capacity must be at least 1!");
  }

  clear(): void {
    this.map.clear();
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  forEach(
    callbackfn: (value: T, key: string, map: Map<string, T>) => void,
    thisArg?: any,
  ): void {
    this.map.forEach(callbackfn, thisArg);
  }

  get(key: string): T | undefined {
    return this.map.get(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: T): this {
    const { map } = this;
    map.set(key, value);
    while (map.size > this.capacity) {
      const firstKey = map.keys().next().value;
      if (typeof firstKey !== "string") break;

      map.delete(firstKey);
    }
    return this;
  }

  get size() {
    return this.map.size;
  }

  entries(): MapIterator<[string, T]> {
    return this.map.entries();
  }

  keys(): MapIterator<string> {
    return this.map.keys();
  }

  values(): MapIterator<T> {
    return this.map.values();
  }

  [Symbol.iterator](): MapIterator<[string, T]> {
    return this.map[Symbol.iterator]();
  }

  get [Symbol.toStringTag]() {
    return this.map[Symbol.toStringTag];
  }
}
