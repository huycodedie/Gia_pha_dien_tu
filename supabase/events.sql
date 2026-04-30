-- Events module: events, RSVP, RLS, and event image storage.

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  location TEXT,
  type TEXT NOT NULL DEFAULT 'OTHER'
    CHECK (type IN ('MEMORIAL', 'MEETING', 'FESTIVAL', 'QR', 'OTHER')),
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  image_url TEXT,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at IS NULL OR end_at >= start_at)
);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('GOING', 'MAYBE', 'NOT_GOING')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_events_creator_id ON events(creator_id);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_pinned ON events(is_pinned);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_id ON event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_id ON event_rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_status ON event_rsvps(status);

CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION update_events_updated_at();

DROP TRIGGER IF EXISTS event_rsvps_updated_at ON event_rsvps;
CREATE TRIGGER event_rsvps_updated_at
BEFORE UPDATE ON event_rsvps
FOR EACH ROW EXECUTE FUNCTION update_events_updated_at();

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_accessible" ON events;
CREATE POLICY "events_select_accessible" ON events
  FOR SELECT USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'guest'
        AND p.guest_of = events.creator_id
    )
  );

DROP POLICY IF EXISTS "events_insert_owner_or_admin" ON events;
CREATE POLICY "events_insert_owner_or_admin" ON events
  FOR INSERT WITH CHECK (
    creator_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'user')
    )
  );

DROP POLICY IF EXISTS "events_update_owner_or_admin" ON events;
CREATE POLICY "events_update_owner_or_admin" ON events
  FOR UPDATE USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "events_delete_owner_or_admin" ON events;
CREATE POLICY "events_delete_owner_or_admin" ON events
  FOR DELETE USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "event_rsvps_select_accessible_events" ON event_rsvps;
CREATE POLICY "event_rsvps_select_accessible_events" ON event_rsvps
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM events e
      WHERE e.id = event_rsvps.event_id
    )
  );

DROP POLICY IF EXISTS "event_rsvps_insert_own_accessible_events" ON event_rsvps;
CREATE POLICY "event_rsvps_insert_own_accessible_events" ON event_rsvps
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM events e
      WHERE e.id = event_rsvps.event_id
    )
  );

DROP POLICY IF EXISTS "event_rsvps_update_own" ON event_rsvps;
CREATE POLICY "event_rsvps_update_own" ON event_rsvps
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "event_rsvps_delete_own" ON event_rsvps;
CREATE POLICY "event_rsvps_delete_own" ON event_rsvps
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM events e
      JOIN profiles p ON p.id = auth.uid()
      WHERE e.id = event_rsvps.event_id
        AND (e.creator_id = auth.uid() OR p.role = 'admin')
    )
  );

INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('events', 'events', true, true, 5242880, '{"image/*"}')
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  avif_autodetection = EXCLUDED.avif_autodetection,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated users can upload event images" ON storage.objects;
CREATE POLICY "Authenticated users can upload event images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'events'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

DROP POLICY IF EXISTS "Authenticated users can update own event images" ON storage.objects;
CREATE POLICY "Authenticated users can update own event images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'events'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  )
  WITH CHECK (
    bucket_id = 'events'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

DROP POLICY IF EXISTS "Public can view event images" ON storage.objects;
CREATE POLICY "Public can view event images" ON storage.objects
  FOR SELECT USING (bucket_id = 'events');

DROP POLICY IF EXISTS "Users can delete own event images" ON storage.objects;
CREATE POLICY "Users can delete own event images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'events'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );
