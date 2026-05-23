-- Migration: add inventory/reservation check constraints
-- Ensures reserved and total quantities remain consistent and non-negative

ALTER TABLE "inventory"
  ADD CONSTRAINT inventory_reserved_non_negative CHECK (reserved_quantity >= 0);

ALTER TABLE "inventory"
  ADD CONSTRAINT inventory_total_non_negative CHECK (total_quantity >= 0);

ALTER TABLE "inventory"
  ADD CONSTRAINT inventory_reserved_le_total CHECK (reserved_quantity <= total_quantity);

ALTER TABLE "reservations"
  ADD CONSTRAINT reservation_quantity_positive CHECK (quantity > 0);
