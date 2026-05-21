/**
 * Available stock = units physically on hand minus units already reserved
 * by DRAFT invoices that haven't been committed yet.
 *
 * Use this everywhere stock sufficiency is checked — never compare directly
 * against quantityOnHand, which ignores soft reservations.
 *
 * Why separate from quantityOnHand:
 *   Seller A builds a large DRAFT invoice (10 units reserved).
 *   Seller B tries to sell the same product while A is still working.
 *   Without reservedQuantity, B sees 10 units available and sells them.
 *   When A commits, the system oversells. reservedQuantity prevents this.
 */
export function calculateAvailableStock(location: {
  quantityOnHand: number;
  reservedQuantity: number;
}): number {
  return location.quantityOnHand - location.reservedQuantity;
}
