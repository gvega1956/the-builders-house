-- B4: CHECK constraints on product_locations (NOT VALID = protege writes nuevos sin rechazar data existente)
ALTER TABLE "product_locations"
  ADD CONSTRAINT "product_locations_quantityOnHand_check"
  CHECK ("quantityOnHand" >= 0) NOT VALID;

ALTER TABLE "product_locations"
  ADD CONSTRAINT "product_locations_reservedQuantity_check"
  CHECK ("reservedQuantity" >= 0) NOT VALID;

ALTER TABLE "product_locations"
  ADD CONSTRAINT "product_locations_backorderQuantity_check"
  CHECK ("backorderQuantity" >= 0) NOT VALID;
