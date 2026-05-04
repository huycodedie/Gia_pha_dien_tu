-- Enforce max_uses for both free and paid plans.
-- Run this on existing databases after deploying the app changes.

CREATE OR REPLACE FUNCTION can_use_plan(p_user_id UUID, p_plan_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    plan_record RECORD;
    current_usage_count INTEGER;
BEGIN
    SELECT * INTO plan_record FROM plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF plan_record.max_uses IS NOT NULL THEN
        SELECT COALESCE(usage_count, 0) INTO current_usage_count
        FROM user_plan_usage
        WHERE user_id = p_user_id AND plan_id = p_plan_id;

        IF COALESCE(current_usage_count, 0) >= plan_record.max_uses THEN
            RETURN false;
        END IF;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION upgrade_user_role(p_user_id UUID, p_plan_id UUID)
RETURNS TEXT AS $$
DECLARE
    plan_record RECORD;
    expires_at TIMESTAMPTZ;
    subscription_id UUID;
    updated_rows INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT || ':' || p_plan_id::TEXT, 0));

    IF NOT can_use_plan(p_user_id, p_plan_id) THEN
        RETURN 'Cannot use this plan';
    END IF;

    SELECT * INTO plan_record FROM plans WHERE id = p_plan_id;

    expires_at := now() + INTERVAL '1 hour' * (plan_record.duration_days * 24);

    INSERT INTO subscriptions (user_id, plan_id, expires_at)
    VALUES (p_user_id, p_plan_id, expires_at)
    RETURNING id INTO subscription_id;

    SET LOCAL row_security = OFF;

    UPDATE profiles SET role = plan_record.to_role WHERE id = p_user_id;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;

    RESET row_security;

    IF updated_rows = 0 THEN
        RETURN 'Error: Failed to update user role';
    END IF;

    INSERT INTO notifications (user_id, type, title, message, link_url)
    VALUES (
        p_user_id,
        'SYSTEM',
        'Bạn đã được nâng cấp lên User',
        'Tài khoản của bạn đã được nâng cấp lên kế hoạch ' || plan_record.name || '. Thưởng thức các tính năng mới ngay!',
        '/pricing'
    );

    IF plan_record.max_uses IS NOT NULL THEN
        INSERT INTO user_plan_usage (user_id, plan_id, usage_count, last_used_at)
        VALUES (p_user_id, p_plan_id, 1, now())
        ON CONFLICT (user_id, plan_id) DO UPDATE SET
            usage_count = user_plan_usage.usage_count + 1,
            last_used_at = EXCLUDED.last_used_at;
    END IF;

    RETURN 'Success';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

INSERT INTO user_plan_usage (user_id, plan_id, usage_count, last_used_at)
SELECT
    s.user_id,
    s.plan_id,
    COUNT(*)::INTEGER AS usage_count,
    MAX(COALESCE(s.created_at, s.starts_at, now())) AS last_used_at
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
WHERE p.max_uses IS NOT NULL
GROUP BY s.user_id, s.plan_id
ON CONFLICT (user_id, plan_id) DO UPDATE SET
    usage_count = GREATEST(user_plan_usage.usage_count, EXCLUDED.usage_count),
    last_used_at = CASE
        WHEN user_plan_usage.last_used_at IS NULL THEN EXCLUDED.last_used_at
        WHEN EXCLUDED.last_used_at IS NULL THEN user_plan_usage.last_used_at
        ELSE GREATEST(user_plan_usage.last_used_at, EXCLUDED.last_used_at)
    END;
