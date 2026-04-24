


CREATE TABLE IF NOT EXISTS people (
    handle TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    gender INT DEFAULT 1,
    generation INT DEFAULT 1,
    birth_year INT,
    death_year INT,
    birth_date DATE,
    death_date DATE,
    is_living BOOLEAN DEFAULT true,
    is_privacy_filtered BOOLEAN DEFAULT false,
    is_patrilineal BOOLEAN DEFAULT true,
    families TEXT[] DEFAULT '{}',
    parent_families TEXT[] DEFAULT '{}',
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add contact and image fields to people table
ALTER TABLE people ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS facebook TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS current_address TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE people ADD COLUMN IF NOT EXISTS death_date DATE;

CREATE TABLE IF NOT EXISTS families (
    handle TEXT PRIMARY KEY,
    father_handle TEXT,
    mother_handle TEXT,
    children TEXT[] DEFAULT '{}',
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS people_updated_at ON people;
CREATE TRIGGER people_updated_at BEFORE UPDATE ON people
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS families_updated_at ON families;
CREATE TRIGGER families_updated_at BEFORE UPDATE ON families
FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- Function to get relationship between two people
CREATE OR REPLACE FUNCTION get_kinship_relationship(
    p_person1_handle TEXT,
    p_person2_handle TEXT
)
RETURNS TEXT AS $$
DECLARE
    person1 RECORD;
    person2 RECORD;
    gen_diff INT;
    p1_father TEXT;
    p1_mother TEXT;
    p2_father TEXT;
    p2_mother TEXT;
    p1_paternal_grandpa TEXT;
    p1_maternal_grandpa TEXT;
    p2_paternal_grandpa TEXT;
    p2_maternal_grandpa TEXT;
    common_grandpa TEXT;
    distance_to_common INT;
    rel_count INT;
BEGIN
    -- Get both people's info
    SELECT * INTO person1 FROM people WHERE handle = p_person1_handle LIMIT 1;
    SELECT * INTO person2 FROM people WHERE handle = p_person2_handle LIMIT 1;

    IF person1 IS NULL OR person2 IS NULL THEN
        RETURN 'Không xác định';
    END IF;

    -- If same person
    IF p_person1_handle = p_person2_handle THEN
        RETURN 'Chính mình';
    END IF;

    -- Get direct parents
    SELECT father_handle, mother_handle INTO p1_father, p1_mother
    FROM families WHERE children @> ARRAY[p_person1_handle] LIMIT 1;
    
    SELECT father_handle, mother_handle INTO p2_father, p2_mother
    FROM families WHERE children @> ARRAY[p_person2_handle] LIMIT 1;

    gen_diff := person2.generation - person1.generation;

    -- ===== SPOUSE RELATIONSHIP =====
    IF gen_diff = 0 THEN
        -- Check if they are spouses in the same family
        IF EXISTS (
            SELECT 1 FROM families 
            WHERE (father_handle = p_person1_handle AND mother_handle = p_person2_handle) 
               OR (father_handle = p_person2_handle AND mother_handle = p_person1_handle)
        ) THEN
            IF person2.gender = 1 THEN RETURN 'Chồng'; ELSE RETURN 'Vợ'; END IF;
        END IF;
    END IF;

    -- ===== DIRECT PARENT-CHILD RELATIONSHIP =====
    IF gen_diff = -1 AND (p1_father = p_person2_handle OR p1_mother = p_person2_handle) THEN
        IF person2.gender = 1 THEN RETURN 'Cha'; ELSE RETURN 'Mẹ'; END IF;
    END IF;

    IF gen_diff = 1 AND (p2_father = p_person1_handle OR p2_mother = p_person1_handle) THEN
        IF person2.gender = 1 THEN RETURN 'Con trai'; ELSE RETURN 'Con gái'; END IF;
    END IF;

    -- ===== NEPHEW/NIECE: person1 is uncle/aunt, person2 is their niece/nephew =====
    -- Check if person2's parent is a sibling of person1 (same generation, same parents as person1)
    IF gen_diff = 1 AND p2_father IS NOT NULL THEN
        -- Check if p2_father is sibling of person1
        SELECT father_handle, mother_handle INTO p1_paternal_grandpa, p1_maternal_grandpa
        FROM families WHERE children @> ARRAY[p_person1_handle] LIMIT 1;
        
        SELECT father_handle, mother_handle INTO p2_paternal_grandpa, p2_maternal_grandpa
        FROM families WHERE children @> ARRAY[p2_father] LIMIT 1;
        
        -- If they share the same parent and are different people
        IF p1_paternal_grandpa IS NOT NULL AND p1_paternal_grandpa = p2_paternal_grandpa 
           AND p_person1_handle != p2_father THEN
            IF person2.gender = 1 THEN RETURN 'Cháu trai'; ELSE RETURN 'Cháu gái'; END IF;
        END IF;
    END IF;

    IF gen_diff = 1 AND p2_mother IS NOT NULL THEN
        -- Check if p2_mother is sibling of person1
        SELECT father_handle, mother_handle INTO p1_paternal_grandpa, p1_maternal_grandpa
        FROM families WHERE children @> ARRAY[p_person1_handle] LIMIT 1;
        
        SELECT father_handle, mother_handle INTO p2_paternal_grandpa, p2_maternal_grandpa
        FROM families WHERE children @> ARRAY[p2_mother] LIMIT 1;
        
        -- If they share the same parent and are different people
        IF p1_paternal_grandpa IS NOT NULL AND p1_paternal_grandpa = p2_paternal_grandpa 
           AND p_person1_handle != p2_mother THEN
            IF person2.gender = 1 THEN RETURN 'Cháu trai'; ELSE RETURN 'Cháu gái'; END IF;
        END IF;
    END IF;

    -- ===== DIRECT SIBLINGS (same parents) =====
    IF gen_diff = 0 THEN
        IF (p1_father IS NOT NULL AND p1_father != '' AND p1_father = p2_father)
           OR (p1_mother IS NOT NULL AND p1_mother != '' AND p1_mother = p2_mother) THEN
            IF person2.gender = 1 THEN RETURN 'Anh/Em trai'; ELSE RETURN 'Chị/Em gái'; END IF;
        END IF;
    END IF;

    -- ===== IN-LAW RELATIONSHIPS (same generation) =====
    IF gen_diff = 0 THEN
        -- Check if person2 is spouse of person1's child (person1 is parent-in-law of person2)
        -- person1's child is father in f2, person2 is mother in f2
        IF person1.gender = 0 THEN
            SELECT COUNT(*) INTO rel_count FROM families f1
            CROSS JOIN unnest(f1.children) as child
            JOIN families f2 ON f2.father_handle = child
            WHERE f1.mother_handle = p_person1_handle AND f2.mother_handle = p_person2_handle;
            
            IF rel_count > 0 THEN
                RETURN 'Mẹ chồng';
            END IF;
        ELSE
            SELECT COUNT(*) INTO rel_count FROM families f1
            CROSS JOIN unnest(f1.children) as child
            JOIN families f2 ON f2.father_handle = child
            WHERE f1.father_handle = p_person1_handle AND f2.mother_handle = p_person2_handle;
            
            IF rel_count > 0 THEN
                RETURN 'Bố chồng';
            END IF;
        END IF;
        
        -- Check if person2 is spouse of person1's child (male spouse)
        -- person1's child is mother in f2, person2 is father in f2
        IF person1.gender = 0 THEN
            SELECT COUNT(*) INTO rel_count FROM families f1
            CROSS JOIN unnest(f1.children) as child
            JOIN families f2 ON f2.mother_handle = child
            WHERE f1.mother_handle = p_person1_handle AND f2.father_handle = p_person2_handle;
            
            IF rel_count > 0 THEN
                RETURN 'Mẹ vợ';
            END IF;
        ELSE
            SELECT COUNT(*) INTO rel_count FROM families f1
            CROSS JOIN unnest(f1.children) as child
            JOIN families f2 ON f2.mother_handle = child
            WHERE f1.father_handle = p_person1_handle AND f2.father_handle = p_person2_handle;
            
            IF rel_count > 0 THEN
                RETURN 'Bố vợ';
            END IF;
        END IF;
        
        -- Check if person1 is spouse of person2's child (person2 is parent-in-law of person1)
        -- person2's child is father in f2, person1 is mother in f2
        IF person2.gender = 0 THEN
            SELECT COUNT(*) INTO rel_count FROM families f1
            CROSS JOIN unnest(f1.children) as child
            JOIN families f2 ON f2.father_handle = child
            WHERE f1.mother_handle = p_person2_handle AND f2.mother_handle = p_person1_handle;
            
            IF rel_count > 0 THEN
                RETURN 'Mẹ chồng';
            END IF;
        ELSE
            SELECT COUNT(*) INTO rel_count FROM families f1
            CROSS JOIN unnest(f1.children) as child
            JOIN families f2 ON f2.father_handle = child
            WHERE f1.father_handle = p_person2_handle AND f2.mother_handle = p_person1_handle;
            
            IF rel_count > 0 THEN
                RETURN 'Bố chồng';
            END IF;
        END IF;
        
        -- Check if person1 is spouse of person2's child (male spouse)
        -- person2's child is mother in f2, person1 is father in f2
        IF person2.gender = 0 THEN
            SELECT COUNT(*) INTO rel_count FROM families f1
            CROSS JOIN unnest(f1.children) as child
            JOIN families f2 ON f2.mother_handle = child
            WHERE f1.mother_handle = p_person2_handle AND f2.father_handle = p_person1_handle;
            
            IF rel_count > 0 THEN
                RETURN 'Mẹ vợ';
            END IF;
        ELSE
            SELECT COUNT(*) INTO rel_count FROM families f1
            CROSS JOIN unnest(f1.children) as child
            JOIN families f2 ON f2.mother_handle = child
            WHERE f1.father_handle = p_person2_handle AND f2.father_handle = p_person1_handle;
            
            IF rel_count > 0 THEN
                RETURN 'Bố vợ';
            END IF;
        END IF;
    END IF;

    -- ===== IN-LAW RELATIONSHIPS =====
    -- Mother-in-law / Daughter-in-law
    IF gen_diff = 1 THEN
        -- Check if person2 is daughter-in-law of person1 (person1's child spouse)
        -- person1's child is father in f2, person2 is mother in f2
        SELECT COUNT(*) INTO rel_count FROM families f1
        CROSS JOIN unnest(f1.children) as child
        JOIN families f2 ON f2.father_handle = child
        WHERE (f1.father_handle = p_person1_handle OR f1.mother_handle = p_person1_handle) 
          AND f2.mother_handle = p_person2_handle;
        
        IF rel_count > 0 THEN
            RETURN 'Con dâu';
        END IF;
        
        -- Check if person2 is son-in-law of person1 (person1's child spouse)
        -- person1's child is mother in f2, person2 is father in f2
        SELECT COUNT(*) INTO rel_count FROM families f1
        CROSS JOIN unnest(f1.children) as child
        JOIN families f2 ON f2.mother_handle = child
        WHERE (f1.father_handle = p_person1_handle OR f1.mother_handle = p_person1_handle) 
          AND f2.father_handle = p_person2_handle;
        
        IF rel_count > 0 THEN
            RETURN 'Con rể';
        END IF;
    END IF;

    IF gen_diff = -1 THEN
        -- Check if person1 is daughter-in-law of person2 (person2's child spouse)
        -- person2's child is father in f2, person1 is mother in f2
        SELECT COUNT(*) INTO rel_count FROM families f1
        CROSS JOIN unnest(f1.children) as child
        JOIN families f2 ON f2.father_handle = child
        WHERE (f1.father_handle = p_person2_handle OR f1.mother_handle = p_person2_handle) 
          AND f2.mother_handle = p_person1_handle;
        
        IF rel_count > 0 THEN
            IF person2.gender = 0 THEN RETURN 'Mẹ chồng'; ELSE RETURN 'Bố chồng'; END IF;
        END IF;
        
        -- Check if person1 is son-in-law of person2 (person2's child spouse)
        -- person2's child is mother in f2, person1 is father in f2
        SELECT COUNT(*) INTO rel_count FROM families f1
        CROSS JOIN unnest(f1.children) as child
        JOIN families f2 ON f2.mother_handle = child
        WHERE (f1.father_handle = p_person2_handle OR f1.mother_handle = p_person2_handle) 
          AND f2.father_handle = p_person1_handle;
        
        IF rel_count > 0 THEN
            IF person2.gender = 0 THEN RETURN 'Mẹ vợ'; ELSE RETURN 'Bố vợ'; END IF;
        END IF;
    END IF;

    -- ===== UNCLE/AUNT RELATIONSHIP (person2 is sibling of person1's parent) =====
    IF gen_diff = -1 AND p1_father IS NOT NULL THEN
        -- Check if person2 is sibling of father
        SELECT father_handle INTO p1_paternal_grandpa FROM families 
        WHERE children @> ARRAY[p1_father] LIMIT 1;
        
        IF p1_paternal_grandpa IS NOT NULL THEN
            SELECT father_handle INTO p2_paternal_grandpa FROM families 
            WHERE children @> ARRAY[p_person2_handle] LIMIT 1;
            
            IF p1_paternal_grandpa = p2_paternal_grandpa THEN
                IF person2.gender = 1 THEN RETURN 'Chú'; ELSE RETURN 'Cô'; END IF;
            END IF;
        END IF;
    END IF;

    IF gen_diff = -1 AND p1_mother IS NOT NULL THEN
        -- Check if person2 is sibling of mother
        SELECT father_handle INTO p1_maternal_grandpa FROM families 
        WHERE children @> ARRAY[p1_mother] LIMIT 1;
        
        IF p1_maternal_grandpa IS NOT NULL THEN
            SELECT father_handle INTO p2_paternal_grandpa FROM families 
            WHERE children @> ARRAY[p_person2_handle] LIMIT 1;
            
            IF p1_maternal_grandpa = p2_paternal_grandpa THEN
                IF person2.gender = 1 THEN RETURN 'Chú'; ELSE RETURN 'Cô'; END IF;
            END IF;
        END IF;
    END IF;

    -- ===== COUSIN RELATIONSHIP =====
    IF gen_diff = 0 THEN
        IF person2.gender = 1 THEN RETURN 'Anh/Em họ trai'; ELSE RETURN 'Anh/Em họ gái'; END IF;
    END IF;

    -- ===== GRANDPARENT RELATIONSHIPS =====
    IF gen_diff = -2 THEN
        IF person2.gender = 1 THEN RETURN 'Ông'; ELSE RETURN 'Bà'; END IF;
    END IF;

    -- ===== GRANDCHILD RELATIONSHIPS =====
    IF gen_diff = 2 THEN
        IF person2.gender = 1 THEN RETURN 'Cháu trai'; ELSE RETURN 'Cháu gái'; END IF;
    END IF;

    -- ===== OTHER ANCESTORS =====
    IF gen_diff < -2 THEN
        IF gen_diff = -3 THEN RETURN 'Cụ';
        ELSIF gen_diff = -4 THEN RETURN 'Cao tổ';
        ELSIF gen_diff <= -5 THEN RETURN 'Tổ tiên';
        END IF;
    END IF;

    -- ===== OTHER DESCENDANTS =====
    IF gen_diff > 2 THEN
        IF gen_diff = 3 THEN RETURN 'Chắt';
        ELSIF gen_diff = 4 THEN RETURN 'Chút';
        ELSIF gen_diff >= 5 THEN RETURN 'Hậu duệ';
        END IF;
    END IF;

    RETURN 'Quan hệ khác';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



DROP TABLE IF EXISTS profiles;

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    display_name TEXT,
    phone TEXT,
    username TEXT UNIQUE,
    role TEXT DEFAULT 'viewer' CHECK (role IN ('admin','user','viewer','guest')),
    status TEXT DEFAULT 'active',
    guest_of UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- đŸ”¥ TRIGGER CHUáº¨N (KHĂ”NG BAO GIá»œ Lá»–I)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        display_name,
        username,
        role,
        status
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.email, gen_random_uuid()::text),
        COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
        'viewer',
        'active'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;

EXCEPTION
    WHEN OTHERS THEN
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();


-- â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
-- â•‘  3. INDEXES & RLS FOR PRIVATE TREES                     â•‘
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- Add owner_id column if not exists
ALTER TABLE people ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE people ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS has_account BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS is_privacy_filtered BOOLEAN DEFAULT false;
ALTER TABLE people ADD COLUMN IF NOT EXISTS is_patrilineal BOOLEAN DEFAULT true;
ALTER TABLE families ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indexes for owner_id
CREATE INDEX IF NOT EXISTS idx_people_owner ON people(owner_id);
CREATE INDEX IF NOT EXISTS idx_families_owner ON families(owner_id);

-- Helper function to check if someone is a family member of another person
CREATE OR REPLACE FUNCTION is_family_member(p_person_handle TEXT, p_target_person_handle TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_person_handle = p_target_person_handle THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM families
        WHERE (
            (father_handle = p_person_handle OR mother_handle = p_person_handle OR p_person_handle = ANY(children))
            AND
            (father_handle = p_target_person_handle OR mother_handle = p_target_person_handle OR p_target_person_handle = ANY(children))
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Row Level Security: Enable RLS
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;

-- Policies: owner, user, admin, or guest can access (including demo data with owner_id = NULL)
CREATE POLICY "owner_user_admin_guest_read_people" ON people
    FOR SELECT USING (
        owner_id = auth.uid() OR
        owner_id IS NULL OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','user')) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'guest' AND guest_of = people.owner_id)
    );

CREATE POLICY "owner_user_admin_guest_insert_people" ON people
    FOR INSERT WITH CHECK (
        owner_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','user'))
    );

CREATE POLICY "owner_user_admin_guest_update_people" ON people
    FOR UPDATE USING (
        owner_id = auth.uid() OR
        auth_user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','user'))
    );

CREATE POLICY "owner_user_admin_guest_delete_people" ON people
    FOR DELETE USING (
        owner_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','user'))
    );

CREATE POLICY "owner_user_admin_guest_read_families" ON families
    FOR SELECT USING (
        owner_id = auth.uid() OR
        owner_id IS NULL OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','user')) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'guest' AND guest_of = families.owner_id)
    );

CREATE POLICY "owner_user_admin_guest_insert_families" ON families
    FOR INSERT WITH CHECK (
        owner_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','user'))
    );

CREATE POLICY "owner_user_admin_guest_update_families" ON families
    FOR UPDATE USING (
        owner_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','user'))
    );

CREATE POLICY "owner_user_admin_guest_delete_families" ON families
    FOR DELETE USING (
        owner_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','user'))
    );


-- â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
-- â•‘  4. CONTRIBUTIONS                                      â•‘
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CREATE TABLE IF NOT EXISTS contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES auth.users(id),
    person_handle TEXT,
    field_name TEXT,
    new_value TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);


-- â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
-- â•‘  4. POSTS & COMMENTS                                   â•‘
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'general',
    title TEXT,
    body TEXT NOT NULL,
    image_url TEXT,
    is_pinned BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'published',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link_url TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Guest invitation codes
CREATE TABLE IF NOT EXISTS guest_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    used_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Update trigger for posts
CREATE OR REPLACE FUNCTION update_updated_at_posts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_posts();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);


-- â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
-- â•‘  5. PROFILES, CONTRIBUTIONS & COMMENTS RLS             â•‘
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read profiles" ON profiles FOR SELECT USING (true);

CREATE POLICY "update own profile" ON profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "admin update profiles" ON profiles
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
    )
);

-- CONTRIBUTIONS
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read contributions" ON contributions FOR SELECT USING (true);
CREATE POLICY "insert contributions" ON contributions
FOR INSERT WITH CHECK (auth.uid() = author_id);

-- POSTS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read posts" ON posts FOR SELECT USING (true);
CREATE POLICY "admin insert posts" ON posts
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "update own posts" ON posts
FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "admin update posts" ON posts
FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "delete own posts" ON posts
FOR DELETE USING (auth.uid() = author_id);
CREATE POLICY "admin delete posts" ON posts
FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- COMMENTS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read comments" ON comments FOR SELECT USING (true);
CREATE POLICY "insert comments" ON comments
FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "delete own comments" ON comments
FOR DELETE USING (auth.uid() = author_id);

-- NOTIFICATIONS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert notifications" ON notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);


-- Sá»­a table people cho handle tá»± Ä‘á»™ng tÄƒng
CREATE SEQUENCE IF NOT EXISTS person_handle_seq START 1000;

CREATE OR REPLACE FUNCTION generate_person_handle()
RETURNS TEXT AS $$
DECLARE
    next_val INTEGER;
    candidate_handle TEXT;
BEGIN
    LOOP
        SELECT nextval('person_handle_seq') INTO next_val;
        candidate_handle := 'P' || next_val::TEXT;
        -- Check if handle already exists
        IF NOT EXISTS (SELECT 1 FROM people WHERE handle = candidate_handle) THEN
            RETURN candidate_handle;
        END IF;
        -- If exists, loop again (very rare case)
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to generate family member account credentials
CREATE OR REPLACE FUNCTION generate_family_account_credentials(p_display_name TEXT)
RETURNS JSON AS $$
DECLARE
    last_name TEXT;
    random_num TEXT;
    username TEXT;
    email TEXT;
BEGIN
    -- Extract last name (last word from display_name)
    last_name := TRIM(REGEXP_SUBSTR(p_display_name, '[^ ]+$'));
    
    -- Generate random 3-digit number
    random_num := LPAD((FLOOR(RANDOM() * 1000)::INTEGER)::TEXT, 3, '0');
    
    -- Create username from display_name
    username := REGEXP_REPLACE(p_display_name, '\s+', '_', 'g');
    
    -- Create email: lastname + random number + @gmail.com
    email := LOWER(last_name || random_num) || '@gmail.com';
    
    RETURN json_build_object(
        'username', username,
        'email', email,
        'password', '123456'
    );
END;
$$ LANGUAGE plpgsql;

ALTER TABLE people 
ALTER COLUMN handle SET DEFAULT generate_person_handle();

-- â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
-- â•‘  6. DEMO DATA (PRIVATE TREES)                          â•‘
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- â ï¸  Cáº¬P NHáº¬T: Demo data Ä‘á»ƒ owner_id = NULL (public/demo data)
--    Admin cĂ³ thá»ƒ xem táº¥t cáº£ data, ká»ƒ cáº£ demo data (owner_id = NULL)
--    User chá»‰ tháº¥y data cá»§a mĂ¬nh (owner_id = auth.uid())


-- â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
-- â•‘  7. FUNCTIONS FOR ADDING PEOPLE & SPOUSES              â•‘
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- Function to add a new person to the family tree
CREATE OR REPLACE FUNCTION add_person(
    p_display_name TEXT,
    p_gender INTEGER DEFAULT 1,
    p_generation INTEGER DEFAULT 1,
    p_birth_year INTEGER DEFAULT NULL,
    p_death_year INTEGER DEFAULT NULL,
    p_is_living BOOLEAN DEFAULT true,
    p_is_privacy_filtered BOOLEAN DEFAULT false,
    p_is_patrilineal BOOLEAN DEFAULT true,
    p_image_url TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_facebook TEXT DEFAULT NULL,
    p_current_address TEXT DEFAULT NULL,
    p_owner_id UUID DEFAULT auth.uid()
)
RETURNS TEXT AS $$
DECLARE
    new_handle TEXT;
BEGIN
    -- Generate new handle
    SELECT generate_person_handle() INTO new_handle;
    
    -- Insert new person
    INSERT INTO people (
        handle, display_name, gender, generation, birth_year, death_year, 
        is_living, is_privacy_filtered, is_patrilineal, image_url, phone, facebook, current_address, owner_id
    ) VALUES (
        new_handle, p_display_name, p_gender, p_generation, p_birth_year, p_death_year,
        p_is_living, p_is_privacy_filtered, p_is_patrilineal, p_image_url, p_phone, p_facebook, p_current_address, p_owner_id
    );
    
    RETURN new_handle;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old function overload without p_create_account parameter to avoid ambiguity
DROP FUNCTION IF EXISTS public.add_spouse(TEXT, TEXT, INTEGER, INTEGER, DATE, INTEGER, DATE, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, TEXT, UUID) CASCADE;

-- Function to add a spouse (ngÆ°á»i ngoáº¡i tá»™c) to an existing person
CREATE OR REPLACE FUNCTION add_spouse(
    p_person_handle TEXT,
    p_spouse_name TEXT,
    p_spouse_gender INTEGER,
    p_spouse_birth_year INTEGER DEFAULT NULL,
    p_spouse_birth_date DATE DEFAULT NULL,
    p_spouse_death_year INTEGER DEFAULT NULL,
    p_spouse_death_date DATE DEFAULT NULL,
    p_spouse_is_living BOOLEAN DEFAULT true,
    p_spouse_is_patrilineal BOOLEAN DEFAULT false,
    p_spouse_image_url TEXT DEFAULT NULL,
    p_spouse_phone TEXT DEFAULT NULL,
    p_spouse_facebook TEXT DEFAULT NULL,
    p_spouse_current_address TEXT DEFAULT NULL,
    p_create_account BOOLEAN DEFAULT false,
    p_owner_id UUID DEFAULT auth.uid()
)
RETURNS JSON AS $$
DECLARE
    spouse_handle TEXT;
    person_record RECORD;
    family_handle TEXT;
    account_creds JSON;
BEGIN
    -- Check if person exists and user has access
    SELECT * INTO person_record 
    FROM people 
    WHERE handle = p_person_handle 
    AND (owner_id = p_owner_id OR owner_id IS NULL OR 
         EXISTS (SELECT 1 FROM profiles WHERE id = p_owner_id AND role IN ('admin','user')));
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Person not found or access denied';
    END IF;
    
    -- Generate spouse handle
    SELECT generate_person_handle() INTO spouse_handle;
    
    -- Generate account credentials if requested
    IF p_create_account THEN
        SELECT generate_family_account_credentials(p_spouse_name) INTO account_creds;
    END IF;
    
    -- Insert spouse
    INSERT INTO people (
        handle, display_name, gender, generation, birth_year, birth_date, death_year, death_date, 
        is_living, is_privacy_filtered, is_patrilineal, image_url, phone, facebook, current_address, owner_id
    ) VALUES (
        spouse_handle, p_spouse_name, p_spouse_gender, person_record.generation, 
        p_spouse_birth_year, p_spouse_birth_date, p_spouse_death_year, p_spouse_death_date, p_spouse_is_living, 
        false, p_spouse_is_patrilineal, p_spouse_image_url, p_spouse_phone, p_spouse_facebook, p_spouse_current_address, person_record.owner_id
    );
    
    -- Create or update family
    -- Check if person already has a family
    SELECT handle INTO family_handle 
    FROM families 
    WHERE (father_handle = p_person_handle OR mother_handle = p_person_handle);
    
    IF family_handle IS NULL THEN
        -- Create new family
        family_handle := 'F' || nextval('person_handle_seq')::TEXT;
        
        IF person_record.gender = 1 THEN -- Male
            INSERT INTO families (handle, father_handle, mother_handle, owner_id) 
            VALUES (family_handle, p_person_handle, spouse_handle, person_record.owner_id);
        ELSE -- Female
            INSERT INTO families (handle, father_handle, mother_handle, owner_id) 
            VALUES (family_handle, spouse_handle, p_person_handle, person_record.owner_id);
        END IF;
        
        -- Update person's families
        UPDATE people 
        SET families = families || ARRAY[family_handle] 
        WHERE handle = p_person_handle;
        
        -- Update spouse's families
        UPDATE people 
        SET families = ARRAY[family_handle] 
        WHERE handle = spouse_handle;
    ELSE
        -- Update existing family
        IF person_record.gender = 1 THEN -- Male
            UPDATE families 
            SET mother_handle = spouse_handle, owner_id = person_record.owner_id
            WHERE handle = family_handle;
        ELSE -- Female
            UPDATE families 
            SET father_handle = spouse_handle, owner_id = person_record.owner_id
            WHERE handle = family_handle;
        END IF;
        
        -- Update spouse's families
        UPDATE people 
        SET families = ARRAY[family_handle] 
        WHERE handle = spouse_handle;
    END IF;
    
    -- Return result with person handle and account credentials if created
    RETURN json_build_object(
        'person_handle', spouse_handle,
        'account', account_creds,
        'family_handle', family_handle,
        'person_name', p_spouse_name,
        'relation', 'Vợ/Chồng'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old function overload without p_create_account parameter to avoid ambiguity
DROP FUNCTION IF EXISTS public.add_child(TEXT, TEXT, INTEGER, INTEGER, DATE, INTEGER, DATE, BOOLEAN, TEXT, TEXT, TEXT, TEXT, UUID) CASCADE;

-- Function to add a child to a family
CREATE OR REPLACE FUNCTION add_child(
    p_family_handle TEXT,
    p_child_name TEXT,
    p_child_gender INTEGER DEFAULT 1,
    p_child_birth_year INTEGER DEFAULT NULL,
    p_child_birth_date DATE DEFAULT NULL,
    p_child_death_year INTEGER DEFAULT NULL,
    p_child_death_date DATE DEFAULT NULL,
    p_child_is_living BOOLEAN DEFAULT true,
    p_child_image_url TEXT DEFAULT NULL,
    p_child_phone TEXT DEFAULT NULL,
    p_child_facebook TEXT DEFAULT NULL,
    p_child_current_address TEXT DEFAULT NULL,
    p_create_account BOOLEAN DEFAULT false,
    p_owner_id UUID DEFAULT auth.uid()
)
RETURNS JSON AS $$
DECLARE
    child_handle TEXT;
    family_record RECORD;
    parent_generation INTEGER;
    parent_owner UUID;
    account_creds JSON;
    parent_names TEXT;
BEGIN
    -- Check if family exists and user has access
    SELECT * INTO family_record 
    FROM families 
    WHERE handle = p_family_handle 
    AND (owner_id IS NULL OR 
         EXISTS (SELECT 1 FROM people WHERE (handle = father_handle OR handle = mother_handle) AND owner_id = p_owner_id) OR
         EXISTS (SELECT 1 FROM profiles WHERE id = p_owner_id AND role IN ('admin','user')));
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Family not found or access denied';
    END IF;
    
    -- Get parent generation and names for description
    SELECT generation INTO parent_generation 
    FROM people 
    WHERE handle = COALESCE(family_record.father_handle, family_record.mother_handle);
    
    -- Get parent names for account description
    SELECT COALESCE(father.display_name || ' & ' || mother.display_name, father.display_name, mother.display_name)
    INTO parent_names
    FROM people father
    LEFT JOIN people mother ON mother.handle = family_record.mother_handle
    WHERE father.handle = family_record.father_handle;
    
    -- Generate child handle
    SELECT generate_person_handle() INTO child_handle;
    
    -- Generate account credentials if requested
    IF p_create_account THEN
        SELECT generate_family_account_credentials(p_child_name) INTO account_creds;
    END IF;
    
    -- Insert child
    INSERT INTO people (
        handle, display_name, gender, generation, birth_year, birth_date, death_year, death_date, 
        is_living, is_privacy_filtered, is_patrilineal, parent_families, image_url, phone, facebook, current_address, owner_id
    ) VALUES (
        child_handle, p_child_name, p_child_gender, parent_generation + 1, 
        p_child_birth_year, p_child_birth_date, p_child_death_year, p_child_death_date, p_child_is_living, 
        false, true, ARRAY[p_family_handle], p_child_image_url, p_child_phone, p_child_facebook, p_child_current_address, family_record.owner_id
    );
    
    -- Update family's children
    UPDATE families 
    SET children = children || ARRAY[child_handle] 
    WHERE handle = p_family_handle;
    
    -- Return result with person handle and account credentials if created
    RETURN json_build_object(
        'person_handle', child_handle,
        'account', account_creds,
        'family_handle', p_family_handle,
        'person_name', p_child_name,
        'parent_names', parent_names,
        'relation', 'con'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
-- â•‘  8. PRICING SYSTEM                                     â•‘
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent < 100),
    currency TEXT DEFAULT 'VND',
    duration_days INTEGER NOT NULL,
    from_role TEXT NOT NULL CHECK (from_role IN ('viewer')),
    to_role TEXT NOT NULL CHECK (to_role IN ('user')),
    is_free BOOLEAN DEFAULT false,
    max_uses INTEGER, -- NULL = unlimited
    people_limit INTEGER DEFAULT 30, -- Number of people user can add with this plan
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    starts_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- User plan usage tracking
CREATE TABLE IF NOT EXISTS user_plan_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, plan_id) -- Unique constraint for ON CONFLICT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);

-- RLS for subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plan_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_subscriptions" ON subscriptions;
CREATE POLICY "users_read_own_subscriptions" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins_read_all_subscriptions" ON subscriptions;
CREATE POLICY "admins_read_all_subscriptions" ON subscriptions
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "users_read_own_usage" ON user_plan_usage
    FOR SELECT USING (auth.uid() = user_id);

-- Function to check if user can use a plan
CREATE OR REPLACE FUNCTION can_use_plan(p_user_id UUID, p_plan_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    plan_record RECORD;
    current_usage_count INTEGER;
BEGIN
    -- Get plan details
    SELECT * INTO plan_record FROM plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Check if plan is free and has usage limits
    IF plan_record.is_free AND plan_record.max_uses IS NOT NULL THEN
        SELECT usage_count INTO current_usage_count
        FROM user_plan_usage
        WHERE user_id = p_user_id AND plan_id = p_plan_id;

        IF current_usage_count >= plan_record.max_uses THEN
            RETURN false;
        END IF;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to upgrade user role
CREATE OR REPLACE FUNCTION upgrade_user_role(p_user_id UUID, p_plan_id UUID)
RETURNS TEXT AS $$
DECLARE
    plan_record RECORD;
    expires_at TIMESTAMPTZ;
    subscription_id UUID;
    updated_rows INTEGER;
BEGIN
    -- Check if user can use this plan
    IF NOT can_use_plan(p_user_id, p_plan_id) THEN
        RETURN 'Cannot use this plan';
    END IF;

    -- Get plan details
    SELECT * INTO plan_record FROM plans WHERE id = p_plan_id;

    -- Calculate expiration
    expires_at := now() + INTERVAL '1 day' * plan_record.duration_days;

    -- Create subscription
    INSERT INTO subscriptions (user_id, plan_id, expires_at)
    VALUES (p_user_id, p_plan_id, expires_at)
    RETURNING id INTO subscription_id;

    -- Update user role - bypass RLS for this system operation
    SET LOCAL row_security = OFF;
    
    UPDATE profiles SET role = plan_record.to_role WHERE id = p_user_id;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    RESET row_security;

    -- Check if update actually succeeded
    IF updated_rows = 0 THEN
        RETURN 'Error: Failed to update user role';
    END IF;

    -- Create notification for role upgrade
    INSERT INTO notifications (user_id, type, title, message, link_url)
    VALUES (
        p_user_id,
        'SYSTEM',
        'Bạn đã được nâng cấp lên User',
        'Tài khoản của bạn đã được nâng cấp lên kế hoạch ' || plan_record.name || '. Thưởng thức các tính năng mới ngay!',
        '/pricing'
    );

    -- Track usage for free plans
    IF plan_record.is_free THEN
        INSERT INTO user_plan_usage (user_id, plan_id, usage_count, last_used_at)
        VALUES (p_user_id, p_plan_id, 1, now())
        ON CONFLICT (user_id, plan_id) DO UPDATE SET
            usage_count = user_plan_usage.usage_count + 1,
            last_used_at = EXCLUDED.last_used_at;
    END IF;

    RETURN 'Success';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to auto-downgrade expired subscriptions
CREATE OR REPLACE FUNCTION auto_downgrade_expired_subscriptions()
RETURNS INTEGER AS $$
DECLARE
    expired_sub RECORD;
    downgrade_count INTEGER := 0;
BEGIN
    -- Find expired subscriptions
    FOR expired_sub IN
        SELECT s.user_id, p.from_role
        FROM subscriptions s
        JOIN plans p ON s.plan_id = p.id
        WHERE s.status = 'active' AND s.expires_at < now()
    LOOP
        -- Downgrade user role - bypass RLS for this system operation
        SET LOCAL row_security = OFF;
        
        UPDATE profiles SET role = expired_sub.from_role WHERE id = expired_sub.user_id;
        
        RESET row_security;

        -- Create expiry notification
        INSERT INTO notifications (user_id, type, title, message, link_url)
        VALUES (
            expired_sub.user_id,
            'SYSTEM',
            'Tài khoản User đã hết hạn',
            'Tài khoản User của bạn đã hết hạn và đã quay về role Viewer. Vui lòng gia hạn để tiếp tục sử dụng tính năng.',
            '/pricing'
        );

        -- Mark subscription as expired
        UPDATE subscriptions SET status = 'expired' WHERE user_id = expired_sub.user_id AND status = 'active';
        downgrade_count := downgrade_count + 1;
    END LOOP;

    RETURN downgrade_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a trigger to auto-downgrade on subscription updates
CREATE OR REPLACE FUNCTION send_subscription_expiry_reminders()
RETURNS INTEGER AS $$
DECLARE
    expiring RECORD;
    reminder_count INTEGER := 0;
BEGIN
    FOR expiring IN
        SELECT s.user_id, p.name, s.expires_at
        FROM subscriptions s
        JOIN plans p ON s.plan_id = p.id
        WHERE s.status = 'active' AND s.expires_at BETWEEN now() AND now() + INTERVAL '2 days'
    LOOP
        -- avoid duplicate reminder in same period
        IF NOT EXISTS (
            SELECT 1 FROM notifications
            WHERE user_id = expiring.user_id
              AND type = 'SYSTEM'
              AND title = 'Tài khoản User sắp hết hạn'
              AND created_at > now() - INTERVAL '1 day'
        ) THEN
            INSERT INTO notifications (user_id, type, title, message, link_url)
            VALUES (
                expiring.user_id,
                'SYSTEM',
                'Tài khoản User sắp hết hạn',
                'Tài khoản của bạn trên gói ' || expiring.name || ' sẽ hết hạn vào ' || to_char(expiring.expires_at, 'DD/MM/YYYY HH24:MI') || '. Vui lòng gia hạn để không gián đoạn.',
                '/pricing'
            );
            reminder_count := reminder_count + 1;
        END IF;
    END LOOP;

    RETURN reminder_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_subscription_expiry()
RETURNS TRIGGER AS $$
BEGIN
    -- If subscription just expired, downgrade user
    IF NEW.status = 'active' AND NEW.expires_at < now() AND (OLD.status != 'active' OR OLD.expires_at >= now()) THEN
        -- Bypass RLS for this system operation
        SET LOCAL row_security = OFF;
        
        UPDATE profiles SET role = (SELECT from_role FROM plans WHERE id = NEW.plan_id) WHERE id = NEW.user_id;
        
        RESET row_security;
        NEW.status := 'expired';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER subscription_expiry_trigger
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION check_subscription_expiry();

-- Insert default plans
INSERT INTO plans (name, description, price, discount_percent, duration_days, from_role, to_role, is_free, max_uses, people_limit) VALUES
('Free Trial', 'Nâng cấp lên User miễn phí trong 3 ngày', 0, 0, 3, 'viewer', 'user', true, 1, 30),
('Monthly Premium', 'Nâng cấp lên User trong 1 tháng', 50000, 0, 30, 'viewer', 'user', false, NULL, 150)
ON CONFLICT DO NOTHING;


-- â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
-- â•‘  STORAGE: Posts bucket for images                       â•‘
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    
-- Create posts storage bucket
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('posts', 'posts', true, true, 5242880, '{"image/*"}')
ON CONFLICT (id) DO NOTHING;

-- Create people storage bucket for profile images
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('people', 'people', true, true, 5242880, '{"image/*"}')
ON CONFLICT (id) DO NOTHING;

-- Storage policies for posts bucket
DROP POLICY IF EXISTS "Authenticated users can upload post images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view post images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own post images" ON storage.objects;

CREATE POLICY "Authenticated users can upload post images" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'posts' AND auth.uid()::text = (string_to_array(name, '/'))[1]);

CREATE POLICY "Public can view post images" ON storage.objects
    FOR SELECT USING (bucket_id = 'posts');

CREATE POLICY "Users can delete own post images" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'posts' AND auth.uid()::text = (string_to_array(name, '/'))[1]);

-- Storage policies for people bucket
DROP POLICY IF EXISTS "Authenticated users can upload people images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view people images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own people images" ON storage.objects;

CREATE POLICY "Authenticated users can upload people images" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'people' AND auth.uid()::text = (string_to_array(name, '/'))[1]);

CREATE POLICY "Public can view people images" ON storage.objects
    FOR SELECT USING (bucket_id = 'people');

CREATE POLICY "Users can delete own people images" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'people' AND auth.uid()::text = (string_to_array(name, '/'))[1]);


-- ============================================================
SELECT 'database setup thành công system + Pricing + Posts with Images' AS status;
-- ============================================================
