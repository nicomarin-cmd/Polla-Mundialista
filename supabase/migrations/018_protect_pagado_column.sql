-- Proteger la columna pagado de poll_members
-- Solo el sistema de pagos (service_role via Edge Functions) puede cambiar este valor.
-- Cualquier intento desde el frontend (usuario autenticado) lanza un error.

CREATE OR REPLACE FUNCTION protect_pagado_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si pagado está cambiando Y hay un usuario autenticado (frontend) → rechazar
  IF NEW.pagado IS DISTINCT FROM OLD.pagado THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'El estado de pago solo puede actualizarse automáticamente a través del sistema de pagos. No está permitido modificarlo manualmente.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_pagado_immutable ON poll_members;
CREATE TRIGGER enforce_pagado_immutable
  BEFORE UPDATE ON poll_members
  FOR EACH ROW
  EXECUTE FUNCTION protect_pagado_update();
