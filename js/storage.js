// =========================
// Get current user
// =========================

async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await supabaseClient.auth.getUser();

  if (error) throw error;

  if (!user) {
    throw new Error("You are not logged in.");
  }

  return user;
}


// =========================
// Get transactions
// =========================

async function getTransactions() {
  const user = await getCurrentUser();

  const { data, error } = await supabaseClient
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data || [];
}


// =========================
// Add transaction
// =========================

async function addTransaction({
  date,
  description,
  category,
  type,
  amount
}) {
  const user = await getCurrentUser();

  const { data, error } = await supabaseClient
    .from("transactions")
    .insert({
      user_id: user.id,
      date,
      description,
      category,
      type,
      amount
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}


// =========================
// Update transaction
// =========================

async function updateTransaction(
  id,
  {
    date,
    description,
    category,
    type,
    amount
  }
) {
  const user = await getCurrentUser();

  const { data, error } = await supabaseClient
    .from("transactions")
    .update({
      date,
      description,
      category,
      type,
      amount
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;

  return data;
}


// =========================
// Delete transaction
// =========================

async function deleteTransaction(id) {
  const user = await getCurrentUser();

  const { error } = await supabaseClient
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}

// =========================
// Get categories
// =========================

async function getCategories() {
  const user = await getCurrentUser();

  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) throw error;

  return data || [];
}


// =========================
// Add category
// =========================

async function addCategory(name) {
  const user = await getCurrentUser();

  const { data, error } = await supabaseClient
    .from("categories")
    .insert({
      user_id: user.id,
      name: name.trim()
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}