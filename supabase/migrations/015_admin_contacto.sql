-- Agregar campos de contacto al perfil del admin
-- Opcionales: el admin los llena si quiere que los jugadores lo contacten directamente

alter table profiles
  add column if not exists contacto_email   text,
  add column if not exists contacto_telefono text;
