-- Manual QR bank transfer payment flow

CREATE TABLE IF NOT EXISTS payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'VND',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    transfer_note TEXT NOT NULL UNIQUE,
    payment_method TEXT NOT NULL DEFAULT 'bank_transfer_qr',
    qr_payload TEXT,
    bank_id TEXT,
    bank_name TEXT,
    account_no TEXT,
    account_name TEXT,
    admin_note TEXT,
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS bank_id TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS account_no TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS account_name TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_created_at ON payment_orders(created_at DESC);

DROP TRIGGER IF EXISTS payment_orders_updated_at ON payment_orders;
CREATE TRIGGER payment_orders_updated_at
    BEFORE UPDATE ON payment_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_payment_orders" ON payment_orders;
CREATE POLICY "users_read_own_payment_orders" ON payment_orders
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins_read_all_payment_orders" ON payment_orders;
CREATE POLICY "admins_read_all_payment_orders" ON payment_orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE OR REPLACE FUNCTION approve_manual_payment_order(
    p_order_id UUID,
    p_admin_id UUID,
    p_admin_note TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    upgrade_result TEXT;
BEGIN
    SELECT *
    INTO order_record
    FROM payment_orders
    WHERE id = p_order_id AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'Order not found or already processed';
    END IF;

    upgrade_result := upgrade_user_role(order_record.user_id, order_record.plan_id);
    IF upgrade_result <> 'Success' THEN
        RETURN upgrade_result;
    END IF;

    UPDATE payment_orders
    SET
        status = 'confirmed',
        confirmed_at = now(),
        confirmed_by = p_admin_id,
        admin_note = COALESCE(p_admin_note, admin_note)
    WHERE id = p_order_id;

    RETURN 'Success';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION cancel_manual_payment_order(
    p_order_id UUID,
    p_admin_id UUID,
    p_admin_note TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
BEGIN
    UPDATE payment_orders
    SET
        status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = p_admin_id,
        admin_note = COALESCE(p_admin_note, admin_note)
    WHERE id = p_order_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN 'Order not found or already processed';
    END IF;

    RETURN 'Success';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
