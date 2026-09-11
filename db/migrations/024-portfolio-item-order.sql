-- =============================================================================
-- 024 — Order a section's items in one call
-- =============================================================================
--
-- Sections have always been reorderable (`update_section_order`); the items
-- inside them were not, so their order was whatever they were created in and
-- the admin had no way to change it. This is the same function for items,
-- scoped to one section so a call cannot touch another section's rows.
--
-- SECURITY INVOKER (the default): row-level security on portfolio_items still
-- decides who may write, so this grants nothing the owner did not have.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.update_item_order(section_uuid UUID, item_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  FOR i IN 1..coalesce(array_length(item_ids, 1), 0) LOOP
    UPDATE portfolio_items
       SET display_order = i
     WHERE id = item_ids[i]
       AND section_id = section_uuid;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_item_order(UUID, UUID[]) TO authenticated;
