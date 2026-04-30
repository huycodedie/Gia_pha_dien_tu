-- Kinship test dataset for get_kinship_relationship(...)
-- Run this after database-setup-new.sql has been applied.

BEGIN;

DELETE FROM families WHERE handle LIKE 'TST_F%';
DELETE FROM people WHERE handle LIKE 'TST_%';

INSERT INTO people (handle, display_name, gender, generation, is_living, is_patrilineal)
VALUES
    ('TST_ROOT_M', 'Test Thuy To Male', 1, 1, true, true),
    ('TST_ROOT_F', 'Test Thuy To Female', 2, 1, true, false),

    ('TST_GPA', 'Test Ong', 1, 2, true, true),
    ('TST_GMA', 'Test Ba', 2, 2, true, false),
    ('TST_GUNCLE', 'Test Ong Chu', 1, 2, true, true),
    ('TST_GAUNT', 'Test Ba Mu', 2, 2, true, false),

    ('TST_FATHER', 'Test Cha', 1, 3, true, true),
    ('TST_MOTHER', 'Test Me', 2, 3, true, false),
    ('TST_AUNT', 'Test Co', 2, 3, true, false),
    ('TST_AUNT_HUSBAND', 'Test Duong', 1, 3, true, false),
    ('TST_GUNCLE_CHILD', 'Test Con Ong Chu', 1, 3, true, true),

    ('TST_ME', 'Test Toi', 1, 4, true, true),
    ('TST_SIBLING', 'Test Anh Em', 1, 4, true, true),
    ('TST_ME_WIFE', 'Test Vo Toi', 2, 4, true, false),
    ('TST_SIBLING_WIFE', 'Test Vo Anh Em', 2, 4, true, false),
    ('TST_COUSIN', 'Test Anh Em Ho', 2, 4, true, false),

    ('TST_CHILD', 'Test Con', 1, 5, true, true),
    ('TST_CHILD_WIFE', 'Test Vo Con', 2, 5, true, false),
    ('TST_GRANDCHILD', 'Test Chau', 1, 6, true, true),
    ('TST_GRANDCHILD_WIFE', 'Test Vo Chau', 2, 6, true, false),
    ('TST_GREATGRANDCHILD', 'Test Chat', 1, 7, true, true),
    ('TST_GREATGRANDCHILD_WIFE', 'Test Vo Chat', 2, 7, true, false),
    ('TST_CHUT', 'Test Chut', 1, 8, true, true),
    ('TST_CHUT_WIFE', 'Test Vo Chut', 2, 8, true, false),
    ('TST_CHIT', 'Test Chit', 1, 9, true, true),
    ('TST_CHIT_WIFE', 'Test Vo Chit', 2, 9, true, false),
    ('TST_HUYENTON', 'Test Huyen Ton', 1, 10, true, true);

INSERT INTO families (handle, father_handle, mother_handle, children)
VALUES
    ('TST_F001', 'TST_ROOT_M', 'TST_ROOT_F', ARRAY['TST_GPA', 'TST_GUNCLE']),
    ('TST_F002', 'TST_GPA', 'TST_GMA', ARRAY['TST_FATHER', 'TST_AUNT']),
    ('TST_F003', 'TST_GUNCLE', 'TST_GAUNT', ARRAY['TST_GUNCLE_CHILD']),
    ('TST_F004', 'TST_FATHER', 'TST_MOTHER', ARRAY['TST_ME', 'TST_SIBLING']),
    ('TST_F005', 'TST_AUNT_HUSBAND', 'TST_AUNT', ARRAY['TST_COUSIN']),
    ('TST_F006', 'TST_ME', 'TST_ME_WIFE', ARRAY['TST_CHILD']),
    ('TST_F007', 'TST_SIBLING', 'TST_SIBLING_WIFE', ARRAY[]::TEXT[]),
    ('TST_F008', 'TST_CHILD', 'TST_CHILD_WIFE', ARRAY['TST_GRANDCHILD']),
    ('TST_F009', 'TST_GRANDCHILD', 'TST_GRANDCHILD_WIFE', ARRAY['TST_GREATGRANDCHILD']),
    ('TST_F010', 'TST_GREATGRANDCHILD', 'TST_GREATGRANDCHILD_WIFE', ARRAY['TST_CHUT']),
    ('TST_F011', 'TST_CHUT', 'TST_CHUT_WIFE', ARRAY['TST_CHIT']),
    ('TST_F012', 'TST_CHIT', 'TST_CHIT_WIFE', ARRAY['TST_HUYENTON']);

WITH cases(case_name, person1_handle, person2_handle, expected) AS (
    VALUES
        ('self', 'TST_ME', 'TST_ME', 'Chính mình'),
        ('spouse', 'TST_ME', 'TST_ME_WIFE', 'Vợ'),
        ('father', 'TST_ME', 'TST_FATHER', 'Cha'),
        ('child', 'TST_ME', 'TST_CHILD', 'Con trai'),
        ('grandchild', 'TST_ME', 'TST_GRANDCHILD', 'Cháu trai'),
        ('great-grandchild', 'TST_ME', 'TST_GREATGRANDCHILD', 'Chắt trai'),
        ('chut', 'TST_ME', 'TST_CHUT', 'Chút trai'),
        ('chit', 'TST_ME', 'TST_CHIT', 'Chít trai'),
        ('huyen-ton', 'TST_ME', 'TST_HUYENTON', 'Huyền tôn'),
        ('grandfather', 'TST_ME', 'TST_GPA', 'Ông'),
        ('granduncle', 'TST_ME', 'TST_GUNCLE', 'Ông chú/bác'),
        ('granduncle-wife', 'TST_ME', 'TST_GAUNT', 'Bà mự/bác'),
        ('granduncle-to-nephew', 'TST_GUNCLE', 'TST_ME', 'Cháu trai'),
        ('granduncle-child', 'TST_ME', 'TST_GUNCLE_CHILD', 'Chú/Bác/Cậu'),
        ('granduncle-child-reverse', 'TST_GUNCLE_CHILD', 'TST_ME', 'Cháu trai'),
        ('sibling-spouse', 'TST_ME', 'TST_SIBLING_WIFE', 'Chị/Em dâu'),
        ('sibling-spouse-reverse', 'TST_SIBLING_WIFE', 'TST_ME', 'Anh/Em chồng'),
        ('wives-of-siblings', 'TST_ME_WIFE', 'TST_SIBLING_WIFE', 'Chị/Em dâu'),
        ('spouse-to-aunt', 'TST_ME_WIFE', 'TST_AUNT', 'Cô/Dì'),
        ('aunt-to-spouse-of-nephew', 'TST_AUNT', 'TST_ME_WIFE', 'Cháu gái'),
        ('child-spouse', 'TST_ME', 'TST_CHILD_WIFE', 'Con dâu')
)
SELECT
    case_name,
    expected,
    get_kinship_relationship(person1_handle, person2_handle) AS actual,
    expected = get_kinship_relationship(person1_handle, person2_handle) AS passed
FROM cases
ORDER BY case_name;

COMMIT;
