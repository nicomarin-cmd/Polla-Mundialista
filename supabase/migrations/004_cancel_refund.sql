-- =====================================================================
-- Migración 004: Soporte para reembolsos al cancelar polla
-- =====================================================================

alter table poll_payments
  add column if not exists refund_tx_hash text;
