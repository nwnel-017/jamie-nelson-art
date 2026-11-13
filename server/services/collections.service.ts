import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
// import { getArtworkForCollection } from "./artworks.service";

async function getCollections(supabase: SupabaseClient<Database>) {
  if (!supabase) {
    console.log("No supabase client provided");
    throw new Error("Missing paremeters!");
  }

  // 1.) Retrieve collections
  const { data: collections, error } = await supabase
    .from("collections")
    .select("id, collection_name");

  if (error || !collections) {
    console.log("Something went wrong: " + error?.message);
    throw new Error("Failed to fetch collections");
  }

  const results = await Promise.all(
    collections.map(async (collection) => {
      const { data: artwork } = await supabase
        .from("artworks")
        .select("image_path")
        .eq("collection_id", collection.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let publicImgUrl: string | null = null;

      if (artwork?.image_path) {
        const { data } = supabase.storage
          .from("artwork_images")
          .getPublicUrl(artwork.image_path);
        publicImgUrl = data.publicUrl;
      }

      return {
        id: collection.id,
        collection_name: collection.collection_name,
        image_path: publicImgUrl,
      };
    }),
  );

  return results;
  // For each collection - retrieve one artwork image_path and get the public path
  // for each(let collection in collections) {
  //   const {data: artwork, error} = await supabase.from("artworks").select("imagePath").eq("collection_id", collection.id)
  // }

  // return collections;
}

async function createCollection(
  supabase: SupabaseClient<Database>,
  collection: string,
) {
  if (!supabase || !collection) {
    console.log("Missing parameters");
    throw new Error("Missing parameters!");
  }

  const { error } = await supabase.from("collections").insert({
    collection_name: collection,
  });

  if (error) {
    console.log("Failed to add collection: " + error?.message);
    throw new Error("Failed to add collection");
  }
}

async function deleteCollection(
  supabase: SupabaseClient<Database>,
  id: string,
) {
  if (!supabase || !id) {
    console.log("Missing parameters");
    throw new Error("Missing parameters!");
  }

  console.log("deleting collection: " + id);

  // verify collection exists
  const { data: existingCollection, error: existingCollectionError } =
    await supabase.from("collections").select("*").eq("id", id);

  if (existingCollectionError || !existingCollection) {
    console.log(
      "Existing collection not found " + existingCollectionError?.message,
    );
    throw new Error("Missing existing collection");
  }

  // delete the collection
  try {
    await supabase.from("collections").delete().eq("id", id);
  } catch (err) {
    console.log("Something went wrong while deleting the collection: " + err);
    throw new Error("Failed to delete collection!", { cause: err });
  }
}

async function getCollectionDetails(
  supabase: SupabaseClient<Database>,
  id: string,
) {
  if (!supabase || !id) {
    console.log("Missing parameters");
    throw new Error("Missing parameters!");
  }
  const { data, error } = await supabase
    .from("collections")
    .select("desc,collection_name")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.log("Failed to fetch collection description: " + error?.message);
    throw new Error("Failed to fetch collection description");
  }

  return data;
}

export {
  getCollections,
  createCollection,
  deleteCollection,
  getCollectionDetails,
};
