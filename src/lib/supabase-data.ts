/**
 * Supabase data layer for the genealogy tree
 * Replaces localStorage-based persistence with Supabase PostgreSQL
 */
import { supabase } from "./supabase";
import type { TreeNode, TreeFamily } from "./tree-layout";

export type { TreeNode, TreeFamily };

// ── Helper: Get people limit based on user role and subscription ──

async function getPeopleLimit(
  userId: string,
  role: string | undefined,
): Promise<{ limit: number | null; error: string | null }> {
  // Admin has no limit
  if (role === "admin") {
    return { limit: null, error: null };
  }

  // Guest cannot add people
  if (role === "guest") {
    return {
      limit: 0,
      error: "Tài khoản khách không thể thêm thành viên.",
    };
  }

  // Viewer cannot add people
  if (role === "viewer") {
    return {
      limit: 0,
      error: "Bạn phải nâng cấp tài khoản để thêm thành viên.",
    };
  }

  // User: check active subscription
  if (role === "user") {
    const { data: subscriptions, error: subError } = await supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (subError) {
      console.error("Failed to fetch subscriptions:", subError.message);
      return {
        limit: null,
        error: "Không thể kiểm tra gói đăng ký của bạn.",
      };
    }

    if (!subscriptions || subscriptions.length === 0) {
      return {
        limit: 0,
        error: "Gói đăng ký của bạn đã hết hạn. Vui lòng nâng cấp lại.",
      };
    }

    // Get plan details to determine limit (from the most recent subscription)
    const planId = subscriptions[0].plan_id;
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("people_limit")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      console.error("Failed to fetch plan:", planError?.message);
      return {
        limit: null,
        error: "Không thể xác định gói đăng ký của bạn.",
      };
    }

    const limit = plan.people_limit ?? 30;
    return { limit, error: null };
  }

  return {
    limit: null,
    error: "Không thể xác định quyền của bạn.",
  };
}

// ── Read operations ──

function dbRowToTreeNode(
  row: Record<string, unknown>,
  ownerEmailsById: Record<string, string> = {},
): TreeNode {
  const ownerId = row.owner_id as string | undefined;

  return {
    handle: row.handle as string,
    displayName: row.display_name as string,
    gender: row.gender as number,
    birthYear: row.birth_year as number | undefined,
    deathYear: row.death_year as number | undefined,
    birthDate: row.birth_date as string | undefined,
    deathDate: row.death_date as string | undefined,
    generation: row.generation as number,
    isLiving: row.is_living as boolean,
    isPrivacyFiltered: row.is_privacy_filtered as boolean,
    isPatrilineal: row.is_patrilineal as boolean,
    families: (row.families as string[]) || [],
    parentFamilies: (row.parent_families as string[]) || [],
    ownerId,
    authUserId: row.auth_user_id as string | undefined,
    hasAccount: row.has_account as boolean | undefined,
    imageUrl: row.image_url as string | undefined,
    phone: row.phone as string | undefined,
    facebook: row.facebook as string | undefined,
    currentAddress: row.current_address as string | undefined,
    creatorEmail: ownerId ? ownerEmailsById[ownerId] : undefined,
  };
}

function dbRowToTreeFamily(row: Record<string, unknown>): TreeFamily {
  return {
    handle: row.handle as string,
    fatherHandle: row.father_handle as string | undefined,
    motherHandle: row.mother_handle as string | undefined,
    children: (row.children as string[]) || [],
    ownerId: row.owner_id as string | undefined,
  };
}

// ── Read operations ──

/** Fetch all people from Supabase */
export async function fetchPeople(): Promise<TreeNode[]> {
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;

  let query = supabase
    .from("people")
    .select(
      "handle, display_name, gender, birth_year, death_year, birth_date, death_date, generation, is_living, is_privacy_filtered, is_patrilineal, families, parent_families, owner_id, image_url, phone, facebook, current_address",
    )
    .order("generation")
    .order("handle");

  let isAdmin = false;
  if (userId) {
    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, guest_of")
      .eq("id", userId)
      .single();

    if (profile?.role === "admin") {
      isAdmin = true;
    } else if (profile?.role === "guest" && profile.guest_of) {
      // Guest can see only their creator's data or demo data
      query = query.or(`owner_id.eq.${profile.guest_of},owner_id.is.null`);
    } else {
      // Regular user: show only their data or demo data (owner_id is null)
      query = query.or(`owner_id.eq.${userId},owner_id.is.null`);
    }
  } else {
    // If not logged in, show public data (owner_id is null)
    query = query.is("owner_id", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch people:", error.message);
    return [];
  }

  const rows = (data || []) as Record<string, unknown>[];
  const ownerEmailsById: Record<string, string> = {};

  if (isAdmin) {
    const ownerIds = Array.from(
      new Set(
        rows.map((row) => row.owner_id as string | undefined).filter(Boolean),
      ),
    ) as string[];

    if (ownerIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ownerIds);

      if (profileError) {
        console.warn("Failed to fetch owner emails:", profileError.message);
      } else if (profiles) {
        for (const profile of profiles as Array<Record<string, unknown>>) {
          const id = profile.id as string;
          const email = profile.email as string | undefined;
          if (id && email) {
            ownerEmailsById[id] = email;
          }
        }
      }
    }
  }

  return rows.map((row) => dbRowToTreeNode(row, ownerEmailsById));
}

/** Fetch all families from Supabase */
export async function fetchFamilies(): Promise<TreeFamily[]> {
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;

  let query = supabase
    .from("families")
    .select("handle, father_handle, mother_handle, children, owner_id")
    .order("handle");

  if (userId) {
    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, guest_of")
      .eq("id", userId)
      .single();

    if (profile?.role === "admin") {
      // Admin can see all data (no filter)
    } else if (profile?.role === "guest" && profile.guest_of) {
      // Guest can see only their creator's data or demo data
      query = query.or(`owner_id.eq.${profile.guest_of},owner_id.is.null`);
    } else {
      // Regular user: show only their data or demo data (owner_id is null)
      query = query.or(`owner_id.eq.${userId},owner_id.is.null`);
    }
  } else {
    // If not logged in, show public data (owner_id is null)
    query = query.is("owner_id", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch families:", error.message);
    return [];
  }
  return (data || []).map(dbRowToTreeFamily);
}

/** Fetch both people and families in parallel */
export async function fetchTreeData(): Promise<{
  people: TreeNode[];
  families: TreeFamily[];
}> {
  const [people, families] = await Promise.all([
    fetchPeople(),
    fetchFamilies(),
  ]);
  return { people, families };
}

// ── Write operations (editor mode) ──

/** Insert a new person */
export async function insertPerson(
  person: Omit<TreeNode, "handle">,
): Promise<{ handle: string | null; error: string | null }> {
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;

  if (!userId) {
    return {
      handle: null,
      error: "Bạn phải đăng nhập để thêm thành viên.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const role = profile?.role as string | undefined;

  // Check limit
  const { limit, error: limitError } = await getPeopleLimit(userId, role);
  if (limitError) {
    return { handle: null, error: limitError };
  }

  if (limit !== null && limit > 0) {
    const { count, error: countError } = await supabase
      .from("people")
      .select("handle", { count: "exact", head: true })
      .eq("owner_id", userId);

    if (countError) {
      console.error("Failed to count people:", countError.message);
      return {
        handle: null,
        error: "Không thể kiểm tra giới hạn thành viên hiện tại.",
      };
    }

    if ((count ?? 0) >= limit) {
      return {
        handle: null,
        error: `Bạn đã đạt giới hạn ${limit} thành viên. Vui lòng nâng cấp để thêm nhiều hơn.`,
      };
    }
  }

  const { data, error } = await supabase
    .from("people")
    .insert({
      display_name: person.displayName,
      gender: person.gender,
      generation: person.generation,
      birth_year: person.birthYear,
      death_year: person.deathYear,
      is_living: person.isLiving,
      is_privacy_filtered: person.isPrivacyFiltered,
      is_patrilineal: person.isPatrilineal,
      families: person.families,
      parent_families: person.parentFamilies,
      image_url: person.imageUrl,
      phone: person.phone,
      facebook: person.facebook,
      current_address: person.currentAddress,
      owner_id: userId,
    })
    .select("handle")
    .single();

  if (error) {
    console.error("Failed to insert person:", error.message);
    return { handle: null, error: error.message };
  }
  return { handle: data.handle, error: null };
}

/** Insert a new family */
export async function insertFamily(
  family: Omit<TreeFamily, "handle"> & { handle: string },
): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;

  const { error } = await supabase.from("families").insert({
    handle: family.handle,
    father_handle: family.fatherHandle,
    mother_handle: family.motherHandle,
    children: family.children,
    owner_id: userId,
  });

  if (error) console.error("Failed to insert family:", error.message);
}

/** Update children order for a family */
export async function updateFamilyChildren(
  familyHandle: string,
  newChildrenOrder: string[],
): Promise<void> {
  const { error } = await supabase
    .from("families")
    .update({ children: newChildrenOrder })
    .eq("handle", familyHandle);

  if (error) console.error("Failed to update family children:", error.message);
}

/** Move a child from one family to another */
export async function moveChildToFamily(
  childHandle: string,
  fromFamilyHandle: string,
  toFamilyHandle: string,
  currentFamilies: TreeFamily[],
): Promise<void> {
  const fromFam = currentFamilies.find((f) => f.handle === fromFamilyHandle);
  const toFam = currentFamilies.find((f) => f.handle === toFamilyHandle);

  const updates: Promise<unknown>[] = [];

  // Update families.children on both families
  if (fromFam) {
    updates.push(
      updateFamilyChildren(
        fromFamilyHandle,
        fromFam.children.filter((ch) => ch !== childHandle),
      ),
    );
  }
  if (toFam) {
    updates.push(
      updateFamilyChildren(toFamilyHandle, [
        ...toFam.children.filter((ch) => ch !== childHandle),
        childHandle,
      ]),
    );
  }

  // Update people.parent_families on the child
  const { data: personData } = await supabase
    .from("people")
    .select("parent_families")
    .eq("handle", childHandle)
    .single();

  if (personData) {
    const currentPF = (personData.parent_families as string[]) || [];
    const newPF = [
      ...currentPF.filter((pf) => pf !== fromFamilyHandle),
      toFamilyHandle,
    ];
    updates.push(
      (async () => {
        await supabase
          .from("people")
          .update({
            parent_families: newPF,
            updated_at: new Date().toISOString(),
          })
          .eq("handle", childHandle);
      })(),
    );
  }

  await Promise.all(updates);
}

/** Remove a child from a family */
export async function removeChildFromFamily(
  childHandle: string,
  familyHandle: string,
  currentFamilies: TreeFamily[],
): Promise<void> {
  const fam = currentFamilies.find((f) => f.handle === familyHandle);
  const updates: Promise<unknown>[] = [];

  if (fam) {
    updates.push(
      updateFamilyChildren(
        familyHandle,
        fam.children.filter((ch) => ch !== childHandle),
      ),
    );
  }

  // Also update people.parent_families on the child
  const { data: personData } = await supabase
    .from("people")
    .select("parent_families")
    .eq("handle", childHandle)
    .single();

  if (personData) {
    const currentPF = (personData.parent_families as string[]) || [];
    const newPF = currentPF.filter((pf) => pf !== familyHandle);
    updates.push(
      (async () => {
        await supabase
          .from("people")
          .update({
            parent_families: newPF,
            updated_at: new Date().toISOString(),
          })
          .eq("handle", childHandle);
      })(),
    );
  }

  await Promise.all(updates);
}

/** Update a person's isLiving status */
export async function updatePersonLiving(
  handle: string,
  isLiving: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("people")
    .update({ is_living: isLiving })
    .eq("handle", handle);

  if (error)
    console.error("Failed to update person living status:", error.message);
}

/** Update a person's editable fields */
export async function updatePerson(
  handle: string,
  fields: {
    displayName?: string;
    gender?: number | null;
    birthYear?: number | null;
    deathYear?: number | null;
    birthDate?: string | null;
    deathDate?: string | null;
    isLiving?: boolean;
    isPrivacyFiltered?: boolean;
    imageUrl?: string | null;
    phone?: string | null;
    facebook?: string | null;
    currentAddress?: string | null;
  },
): Promise<void> {
  // Convert camelCase → snake_case for DB
  const dbFields: Record<string, unknown> = {};
  if (fields.displayName !== undefined)
    dbFields.display_name = fields.displayName;
  if (fields.gender !== undefined) dbFields.gender = fields.gender;
  if (fields.birthYear !== undefined) dbFields.birth_year = fields.birthYear;
  if (fields.deathYear !== undefined) dbFields.death_year = fields.deathYear;
  if (fields.birthDate !== undefined) dbFields.birth_date = fields.birthDate;
  if (fields.deathDate !== undefined) dbFields.death_date = fields.deathDate;
  if (fields.isLiving !== undefined) dbFields.is_living = fields.isLiving;
  if (fields.isPrivacyFiltered !== undefined)
    dbFields.is_privacy_filtered = fields.isPrivacyFiltered;
  if (fields.imageUrl !== undefined) dbFields.image_url = fields.imageUrl;
  if (fields.phone !== undefined) dbFields.phone = fields.phone;
  if (fields.facebook !== undefined) dbFields.facebook = fields.facebook;
  if (fields.currentAddress !== undefined)
    dbFields.current_address = fields.currentAddress;

  const { error } = await supabase
    .from("people")
    .update(dbFields)
    .eq("handle", handle);

  if (error) {
    console.error("Failed to update person:", error.message);
    throw error;
  }
}

/** Add a new person to the tree */
export async function addPerson(person: {
  displayName: string;
  gender: number;
  generation: number;
  birthYear?: number | null;
  deathYear?: number | null;
  isLiving?: boolean;
}): Promise<{ handle: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("add_person", {
    p_display_name: person.displayName,
    p_gender: person.gender,
    p_generation: person.generation,
    p_birth_year: person.birthYear || null,
    p_death_year: person.deathYear || null,
    p_is_living: person.isLiving ?? true,
  });

  if (error) {
    console.error("Failed to add person:", error.message);
    return { handle: null, error: error.message };
  }
  return { handle: data, error: null };
}

/** Add a spouse to an existing person */
export async function addSpouse(
  personHandle: string,
  spouse: {
    displayName: string;
    gender: number;
    birthYear?: number | null;
    birthDate?: string | null;
    deathYear?: number | null;
    deathDate?: string | null;
    isLiving?: boolean;
    isPatrilineal?: boolean;
    imageUrl?: string;
    phone?: string;
    facebook?: string;
    currentAddress?: string;
  },
): Promise<{ handle: string | null; error: string | null }> {
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;

  if (!userId) {
    return {
      handle: null,
      error: "Bạn phải đăng nhập để thêm thành viên.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const role = profile?.role as string | undefined;

  // Check limit
  const { limit, error: limitError } = await getPeopleLimit(userId, role);
  if (limitError) {
    return { handle: null, error: limitError };
  }

  if (limit !== null && limit > 0) {
    const { count, error: countError } = await supabase
      .from("people")
      .select("handle", { count: "exact", head: true })
      .eq("owner_id", userId);

    if (countError) {
      console.error("Failed to count people:", countError.message);
      return {
        handle: null,
        error: "Không thể kiểm tra giới hạn thành viên hiện tại.",
      };
    }

    if ((count ?? 0) >= limit) {
      return {
        handle: null,
        error: `Bạn đã đạt giới hạn ${limit} thành viên. Vui lòng nâng cấp để thêm nhiều hơn.`,
      };
    }
  }

  const { data, error } = await supabase.rpc("add_spouse", {
    p_person_handle: personHandle,
    p_spouse_name: spouse.displayName,
    p_spouse_gender: spouse.gender,
    p_spouse_birth_year: spouse.birthYear || null,
    p_spouse_birth_date: spouse.birthDate || null,
    p_spouse_death_year: spouse.deathYear || null,
    p_spouse_death_date: spouse.deathDate || null,
    p_spouse_is_living: spouse.isLiving ?? true,
    p_spouse_is_patrilineal: spouse.isPatrilineal ?? false,
    p_spouse_image_url: spouse.imageUrl || null,
    p_spouse_phone: spouse.phone || null,
    p_spouse_facebook: spouse.facebook || null,
    p_spouse_current_address: spouse.currentAddress || null,
  });

  if (error) {
    console.error("Failed to add spouse:", error.message);
    return { handle: null, error: error.message };
  }
  return { handle: data, error: null };
}

/** Add a child to a family */
export async function addChild(
  familyHandle: string,
  child: {
    displayName: string;
    gender: number;
    birthYear?: number | null;
    birthDate?: string | null;
    deathYear?: number | null;
    deathDate?: string | null;
    isLiving?: boolean;
    imageUrl?: string;
    phone?: string;
    facebook?: string;
    currentAddress?: string;
  },
): Promise<{ handle: string | null; error: string | null }> {
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;

  if (!userId) {
    return {
      handle: null,
      error: "Bạn phải đăng nhập để thêm thành viên.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const role = profile?.role as string | undefined;

  // Check limit
  const { limit, error: limitError } = await getPeopleLimit(userId, role);
  if (limitError) {
    return { handle: null, error: limitError };
  }

  if (limit !== null && limit > 0) {
    const { count, error: countError } = await supabase
      .from("people")
      .select("handle", { count: "exact", head: true })
      .eq("owner_id", userId);

    if (countError) {
      console.error("Failed to count people:", countError.message);
      return {
        handle: null,
        error: "Không thể kiểm tra giới hạn thành viên hiện tại.",
      };
    }

    if ((count ?? 0) >= limit) {
      return {
        handle: null,
        error: `Bạn đã đạt giới hạn ${limit} thành viên. Vui lòng nâng cấp để thêm nhiều hơn.`,
      };
    }
  }

  const { data, error } = await supabase.rpc("add_child", {
    p_family_handle: familyHandle,
    p_child_name: child.displayName,
    p_child_gender: child.gender,
    p_child_birth_year: child.birthYear || null,
    p_child_birth_date: child.birthDate || null,
    p_child_death_year: child.deathYear || null,
    p_child_death_date: child.deathDate || null,
    p_child_is_living: child.isLiving ?? true,
    p_child_image_url: child.imageUrl || null,
    p_child_phone: child.phone || null,
    p_child_facebook: child.facebook || null,
    p_child_current_address: child.currentAddress || null,
  });

  if (error) {
    console.error("Failed to add child:", error.message);
    return { handle: null, error: error.message };
  }
  return { handle: data, error: null };
}

/** Delete a person from the tree */
export async function deletePerson(
  handle: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("people").delete().eq("handle", handle);

  if (error) {
    console.error("Failed to delete person:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

/** Add a new family */
export async function addFamily(family: {
  handle: string;
  fatherHandle?: string;
  motherHandle?: string;
  children?: string[];
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("families").insert({
    handle: family.handle,
    father_handle: family.fatherHandle || null,
    mother_handle: family.motherHandle || null,
    children: family.children || [],
  });

  if (error) {
    console.error("Failed to add family:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

/** Upload person image to Supabase storage */
export async function uploadPersonImage(
  file: File,
  personHandle: string,
): Promise<{ url: string | null; error: string | null }> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user?.id) {
    return { url: null, error: "User not authenticated" };
  }

  // Create unique filename
  const fileName = `${user.user.id}/${personHandle}_${Date.now()}_${file.name}`;

  const { data, error: uploadError } = await supabase.storage
    .from("people")
    .upload(fileName, file);

  if (uploadError) {
    console.error("Failed to upload image:", uploadError.message);
    return { url: null, error: uploadError.message };
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from("people")
    .getPublicUrl(fileName);

  return { url: publicUrlData.publicUrl, error: null };
}

/** Delete person image from Supabase storage */
export async function deletePersonImage(
  imageUrl: string,
): Promise<{ error: string | null }> {
  if (!imageUrl) return { error: null };

  // Extract path from URL
  const urlParts = imageUrl.split("/storage/v1/object/public/people/");
  if (!urlParts[1]) return { error: null };

  const filePath = decodeURIComponent(urlParts[1]);

  const { error } = await supabase.storage.from("people").remove([filePath]);

  if (error) {
    console.error("Failed to delete image:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

/** Update person with new data */
export async function updatePersonProfile(
  handle: string,
  updates: {
    displayName?: string;
    birthYear?: number | null;
    birthDate?: string | null;
    deathYear?: number | null;
    deathDate?: string | null;
    isLiving?: boolean;
    phone?: string | null;
    facebook?: string | null;
    currentAddress?: string | null;
    imageUrl?: string | null;
  },
): Promise<{ error: string | null }> {
  const updateData: Record<string, unknown> = {};

  if (updates.displayName !== undefined)
    updateData.display_name = updates.displayName;
  if (updates.birthYear !== undefined)
    updateData.birth_year = updates.birthYear;
  if (updates.birthDate !== undefined)
    updateData.birth_date = updates.birthDate;
  if (updates.deathYear !== undefined)
    updateData.death_year = updates.deathYear;
  if (updates.deathDate !== undefined)
    updateData.death_date = updates.deathDate;
  if (updates.isLiving !== undefined) updateData.is_living = updates.isLiving;
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.facebook !== undefined) updateData.facebook = updates.facebook;
  if (updates.currentAddress !== undefined)
    updateData.current_address = updates.currentAddress;
  if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl;

  const { error } = await supabase
    .from("people")
    .update(updateData)
    .eq("handle", handle);

  if (error) {
    console.error("Failed to update person:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateAccountProfile(updates: {
  displayName?: string;
  email?: string;
  password?: string;
  phone?: string | null;
}): Promise<{ error: string | null }> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return { error: "Bạn phải đăng nhập để cập nhật hồ sơ." };
  }

  const currentEmail = user.user.email?.trim() || "";
  const cleanedEmail = updates.email?.trim().replace(/^"+|"+$/g, "");

  const authUpdate: {
    email?: string;
    password?: string;
    data?: { display_name?: string };
  } = {};

  if (updates.email !== undefined) {
    if (!cleanedEmail) {
      return { error: "Email không được để trống." };
    }
    if (cleanedEmail !== currentEmail) {
      authUpdate.email = cleanedEmail;
    }
  }

  if (updates.password !== undefined) authUpdate.password = updates.password;
  if (updates.displayName !== undefined) {
    authUpdate.data = { display_name: updates.displayName.trim() };
  }

  if (Object.keys(authUpdate).length > 0) {
    const { error: authError } = await supabase.auth.updateUser(authUpdate);
    if (authError) {
      console.error("Failed to update auth user:", authError.message);
      if (authError.message.includes("rate limit")) {
        return {
          error:
            "Không thể thay đổi email ngay bây giờ. Vui lòng đợi một lúc rồi thử lại.",
        };
      }
      return { error: authError.message };
    }
  }

  const profileUpdate: Record<string, unknown> = {};
  if (updates.displayName !== undefined)
    profileUpdate.display_name = updates.displayName;
  if (updates.email !== undefined) profileUpdate.email = cleanedEmail;
  if (updates.phone !== undefined) profileUpdate.phone = updates.phone;

  if (Object.keys(profileUpdate).length > 0) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.user.id);

    if (profileError) {
      console.error("Failed to update profile:", profileError.message);
      return { error: profileError.message };
    }
  }

  return { error: null };
}

// ═══ GUEST INVITATION FUNCTIONS ═══

/** Generate a guest invitation code */
export async function createGuestInvitation(): Promise<{
  code: string | null;
  error: string | null;
}> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { code: null, error: "Not authenticated" };

  // Generate a random 8-character code
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();

  const { error } = await supabase.from("guest_invitations").insert({
    code,
    created_by: user.user.id,
  });

  if (error) {
    console.error("Failed to create invitation:", error.message);
    return { code: null, error: error.message };
  }

  return { code, error: null };
}

/** Use a guest invitation code to create a guest account */
export async function useGuestInvitation(
  code: string,
  email: string,
  password: string,
  displayName: string,
): Promise<{ error: string | null }> {
  // First check if the invitation code exists and is valid
  const { data: invitation, error: inviteError } = await supabase
    .from("guest_invitations")
    .select("created_by, used_by, expires_at")
    .eq("code", code)
    .single();

  if (inviteError || !invitation) {
    return { error: "Mã mời không hợp lệ" };
  }

  if (invitation.used_by) {
    return { error: "Mã mời đã được sử dụng" };
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { error: "Mã mời đã hết hạn" };
  }

  // Create the guest account
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Không thể tạo tài khoản" };
  }

  // Update the profile to be a guest
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: authData.user.id,
    email,
    display_name: displayName,
    role: "guest",
    guest_of: invitation.created_by,
    status: "active",
  });

  if (profileError) {
    console.error("Failed to update profile:", profileError.message);
    // Clean up the auth user if profile update failed
    await supabase.auth.admin.deleteUser(authData.user.id);
    return { error: "Không thể cập nhật thông tin tài khoản" };
  }

  // Mark the invitation as used
  const { error: updateError } = await supabase
    .from("guest_invitations")
    .update({ used_by: authData.user.id })
    .eq("code", code);

  if (updateError) {
    console.error("Failed to mark invitation as used:", updateError.message);
  }

  return { error: null };
}

/** Get list of guests created by current user */
export async function getMyGuests(): Promise<
  Array<{
    id: string;
    email: string;
    display_name: string;
    created_at: string;
    person_handle?: string;
    person_name?: string;
    relation_label?: string;
  }>
> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, display_name, created_at")
    .eq("guest_of", user.user.id)
    .eq("role", "guest")
    .order("created_at", { ascending: false });

  if (profileError) {
    console.error("Failed to fetch guests:", profileError.message);
    return [];
  }

  if (!profiles || profiles.length === 0) return [];

  const guests = await Promise.all(
    profiles.map(async (profile) => {
      const { data: person, error: personError } = await supabase
        .from("people")
        .select("handle, display_name, gender")
        .eq("auth_user_id", profile.id)
        .single();

      let relation_label = "Người tham quan";
      let person_handle: string | undefined;
      let person_name: string | undefined;

      if (person && !personError) {
        person_handle = person.handle;
        person_name = person.display_name;

        // First check if this person is a child (higher priority)
        const { data: childFamilies } = await supabase
          .from("families")
          .select("father_handle,mother_handle")
          .contains("children", [person.handle])
          .limit(1);

        if (childFamilies && childFamilies.length > 0) {
          const family = childFamilies[0];
          if (family.father_handle) {
            const { data: father } = await supabase
              .from("people")
              .select("display_name")
              .eq("handle", family.father_handle)
              .single();

            if (father?.display_name) {
              relation_label = `Con của ${father.display_name}`;
            }
          }
          if (relation_label === "Người tham quan" && family.mother_handle) {
            const { data: mother } = await supabase
              .from("people")
              .select("display_name")
              .eq("handle", family.mother_handle)
              .single();

            if (mother?.display_name) {
              relation_label = `Con của ${mother.display_name}`;
            }
          }
        }

        // If not a child, check if this person is a spouse (lower priority)
        if (relation_label === "Người tham quan") {
          const { data: spouseFamilies } = await supabase
            .from("families")
            .select("father_handle,mother_handle")
            .or(
              `father_handle.eq.${person.handle},mother_handle.eq.${person.handle}`,
            )
            .limit(1);

          if (spouseFamilies && spouseFamilies.length > 0) {
            const family = spouseFamilies[0];
            const partnerHandle =
              family.father_handle === person.handle
                ? family.mother_handle
                : family.father_handle;

            if (partnerHandle) {
              const { data: partner } = await supabase
                .from("people")
                .select("display_name")
                .eq("handle", partnerHandle)
                .single();

              if (partner?.display_name) {
                relation_label =
                  person.gender === 1
                    ? `Chồng của ${partner.display_name}`
                    : `Vợ của ${partner.display_name}`;
              }
            }
          }
        }
      }

      return {
        id: profile.id,
        email: profile.email,
        display_name: profile.display_name,
        created_at: profile.created_at,
        person_handle,
        person_name,
        relation_label,
      };
    }),
  );

  return guests;
}

/** Get list of pending guest invitations created by current user */
export async function getMyPendingInvitations(): Promise<
  Array<{
    id: string;
    code: string;
    expires_at: string;
    created_at: string;
  }>
> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];

  const { data, error } = await supabase
    .from("guest_invitations")
    .select("id, code, expires_at, created_at")
    .eq("created_by", user.user.id)
    .is("used_by", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch pending invitations:", error.message);
    return [];
  }

  return data || [];
}

/** Remove a guest account (only the creator can do this) */
export async function removeGuest(
  guestId: string,
): Promise<{ error: string | null }> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Not authenticated" };

  // Verify the guest belongs to this user
  const { data: guest, error: guestError } = await supabase
    .from("profiles")
    .select("guest_of")
    .eq("id", guestId)
    .eq("role", "guest")
    .single();

  if (guestError || !guest || guest.guest_of !== user.user.id) {
    return { error: "Không có quyền xóa tài khoản này" };
  }

  // Delete the guest profile (this will cascade delete the auth user due to foreign key)
  const { error } = await supabase.from("profiles").delete().eq("id", guestId);

  if (error) {
    console.error("Failed to remove guest:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

// ═══ KINSHIP & GENEALOGICAL FUNCTIONS ═══

/** Get kinship relationship between two people */
export async function getKinshipRelationship(
  person1Handle: string,
  person2Handle: string,
): Promise<{ relationship: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_kinship_relationship", {
    p_person1_handle: person1Handle,
    p_person2_handle: person2Handle,
  });

  if (error) {
    console.error("Failed to get kinship relationship:", error.message);
    return { relationship: null, error: error.message };
  }

  return { relationship: data || null, error: null };
}
