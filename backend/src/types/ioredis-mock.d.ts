/**
 * Minimal ambient declaration for `ioredis-mock`, which ships without types.
 * The mock is API-compatible with `ioredis`, so we expose its default export as
 * the `ioredis` `Redis` constructor for use in tests.
 */
declare module "ioredis-mock" {
  import type { Redis } from "ioredis";
  const RedisMock: new (...args: unknown[]) => Redis;
  export default RedisMock;
}
