import { Prisma } from '@prisma/client';

/**
 * Converts a JS number to Prisma.Decimal via string representation.
 *
 * Why via string: constructing Decimal from a JS float inherits the float's
 * binary representation error. For example, new Decimal(0.115) stores
 * 0.115000000000000002... rather than exactly 0.115.
 * String("0.115") → Decimal("0.115") is exact.
 *
 * Use this for any number that comes from outside (Zod input, HTTP request)
 * before performing Decimal arithmetic.
 */
export function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(String(value));
}
