import { afterAll, beforeAll, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Use a disposable local Supabase instance; never point this suite at production.
const url = process.env.TEST_SUPABASE_URL || "http://127.0.0.1:54321";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("RLS tests require local Supabase");
const key = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_KEY;
if (!key || !serviceKey)
  throw new Error(
    "Set TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_KEY from your local Supabase instance",
  );
const service = createClient(url, serviceKey);
const anon = createClient(url, key);
const users: string[] = [];
const prefix = `ci-${randomUUID()}`;
const collection = randomUUID();
let admin: SupabaseClient;

const rows: Record<string, Record<string, unknown>> = {
  collections: { id: collection, collection_name: prefix },
  artworks: {
    id: randomUUID(),
    title: prefix,
    collection_id: collection,
    image_path: `${prefix}.png`,
  },
  gallery_images: { id: randomUUID(), image_path: `${prefix}.png`, order: 1 },
  cover_images: { image_path: `${prefix}.png` },
  orders: {
    id: randomUUID(),
    buyer_email: `${prefix}@example.test`,
    buyer_name: "Test Buyer",
    address_line_1: "1 Main St",
    shipping_cost: 1000,
    amount: 25000,
  },
  webhook_event: { event_id: prefix, status_type: "PENDING" },
};
const inserted: [string, unknown][] = [];
beforeAll(async () => {
  async function user(email: string) {
    const password = `Test-${randomUUID()}!`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    users.push(data.user.id);
    const client = createClient(url, key!);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    return client;
  }
  admin = await user(process.env.TEST_ADMIN_EMAIL || "admin@example.test");

  rows.gallery_images.artwork_id = rows.artworks.id;
  for (const [table, row] of Object.entries(rows)) {
    const { data, error } = await service
      .from(table)
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    rows[table] = data;
    inserted.push([table, data.id]);
  }
});
afterAll(async () => {
  for (const [table, id] of inserted.reverse()) {
    const { error } = await service.from(table).delete().eq("id", id);
    if (error) throw error;
  }
  for (const id of users) await service.auth.admin.deleteUser(id);
});
for (const table of Object.keys(rows)) {
  it(`${table}: public content is readable; private data is hidden`, async () => {
    const publicTable = [
      "collections",
      "artworks",
      "gallery_images",
      "cover_images",
    ].includes(table);
    for (const client of [anon]) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .eq("id", rows[table].id);
      expect(error).toBeNull();
      expect(data?.length ?? 0).toBe(publicTable ? 1 : 0);
    }
  });
  it(`${table}: anonymous visitors cannot insert rows`, async () => {
    for (const client of [anon]) {
      const row: Record<string, unknown> = {
        ...rows[table],
        id: table === "cover_images" ? undefined : randomUUID(),
      };
      if (table === "webhook_event") row.event_id = randomUUID();
      const result = await client.from(table).insert(row).select();
      try {
        expect(result.error?.code).toBe("42501");
      } finally {
        for (const value of result.data ?? [])
          await service.from(table).delete().eq("id", value.id);
      }
    }
  });
  it(`${table}: anonymous visitors cannot update or delete rows`, async () => {
    for (const client of [anon]) {
      const row = rows[table];
      const field =
        table === "artworks"
          ? "title"
          : table === "collections"
            ? "collection_name"
            : table === "orders"
              ? "buyer_email"
              : table === "webhook_event"
                ? "status_type"
                : "image_path";
      const update = await client
        .from(table)
        .update({ [field]: row[field] })
        .eq("id", row.id)
        .select();
      expect(update.error).toBeNull();
      expect(update.data).toHaveLength(0);
      const remove = await client
        .from(table)
        .delete()
        .eq("id", row.id)
        .select();
      expect(remove.error).toBeNull();
      expect(remove.data).toHaveLength(0);
      const persisted = await service
        .from(table)
        .select("*")
        .eq("id", row.id)
        .single();
      expect(persisted.error).toBeNull();
      expect(persisted.data?.[field]).toBe(row[field]);
    }
  });
}
for (const table of [
  "collections",
  "artworks",
  "gallery_images",
  "cover_images",
]) {
  it(`${table}: admin can add, read, update and delete content`, async () => {
    const row = {
      ...rows[table],
      id: table === "cover_images" ? undefined : randomUUID(),
    };
    const added = await admin.from(table).insert(row).select().single();
    expect(added.error).toBeNull();
    try {
      const read = await admin
        .from(table)
        .select("*")
        .eq("id", added.data.id)
        .single();
      expect(read.error).toBeNull();
      const field =
        table === "artworks"
          ? "title"
          : table === "collections"
            ? "collection_name"
            : "image_path";
      const update = await admin
        .from(table)
        .update({ [field]: `${prefix}-edited` })
        .eq("id", added.data.id)
        .select()
        .single();
      expect(update.error).toBeNull();
      expect(update.data?.[field]).toBe(`${prefix}-edited`);
      const removed = await admin
        .from(table)
        .delete()
        .eq("id", added.data.id)
        .select();
      expect(removed.error).toBeNull();
      expect(removed.data).toHaveLength(1);
    } finally {
      if (added.data)
        await service.from(table).delete().eq("id", added.data.id);
    }
  });
}
it("admin can read orders and update their status", async () => {
  const read = await admin
    .from("orders")
    .select("*")
    .eq("id", rows.orders.id)
    .single();
  expect(read.error).toBeNull();
  const update = await admin
    .from("orders")
    .update({ status: "SHIPPED" })
    .eq("id", rows.orders.id)
    .select()
    .single();
  expect(update.error).toBeNull();
  expect(update.data?.status).toBe("SHIPPED");
});
it('rejects duplicate Stripe event IDs', async () => {
  const duplicate = await service.from('webhook_event').insert({ event_id: prefix, status_type: 'PENDING' });
  expect(duplicate.error?.code).toBe('23505');
});
it('profile table stays behind the service-role API boundary', async () => {
  const original = await service.from('artist_profile').select('*').eq('id', true).single();
  expect(original.error).toBeNull();
  for (const client of [anon, admin]) {
    const read = await client.from('artist_profile').select('*').eq('id', true);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(0);
    const update = await client.from('artist_profile').update({ bio: original.data.bio }).eq('id', true).select();
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);
  }
});
