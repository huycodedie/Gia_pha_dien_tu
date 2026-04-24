-- Billing admin configuration: bank accounts + plan policies

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_no TEXT NOT NULL,
    account_name TEXT NOT NULL,
    branch_name TEXT,
    note TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON bank_accounts(is_active);

DROP TRIGGER IF EXISTS bank_accounts_updated_at ON bank_accounts;
CREATE TRIGGER bank_accounts_updated_at
    BEFORE UPDATE ON bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "everyone_can_read_active_bank_accounts" ON bank_accounts;
CREATE POLICY "everyone_can_read_active_bank_accounts" ON bank_accounts
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "admins_manage_bank_accounts" ON bank_accounts;
CREATE POLICY "admins_manage_bank_accounts" ON bank_accounts
    FOR ALL USING (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "everyone_can_read_plans" ON plans;
CREATE POLICY "everyone_can_read_plans" ON plans
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins_read_all_subscriptions" ON subscriptions;
CREATE POLICY "admins_read_all_subscriptions" ON subscriptions
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "admins_manage_plans" ON plans;
CREATE POLICY "admins_manage_plans" ON plans
    FOR ALL USING (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
