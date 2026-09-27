// Límite simple de peticiones por cliente (en memoria, por instancia).

interface Bucket {
  tokens: number;
  updated: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private capacity: number,
    private refillPerMinute: number,
  ) {}

  allow(key: string, now: number = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: now };
    const elapsedMin = (now - b.updated) / 60000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsedMin * this.refillPerMinute);
    b.updated = now;
    if (this.buckets.size > 5000) this.buckets.clear();
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }
}

export function clientKey(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : (headers.get('x-real-ip') ?? 'anonimo');
  return ip.slice(0, 64);
}
