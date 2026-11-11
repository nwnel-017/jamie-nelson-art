import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import type { ArtworkData } from "#types/artworks/artworks";
import type { UploadInput } from "./storage.service";
import { uploadFile, deleteFile } from "./storage.service";

// To Do:
// add form validation
// dont pass in a form - pass in fields directly
async function addArtwork(
  supabase: SupabaseClient<Database>,
  artwork: ArtworkData,
  image: UploadInput,
) {
  console.log("Adding new artwork"); // reached here - but throwing error

  if (
    !artwork.title ||
    !artwork.description ||
    !artwork.price ||
    !artwork.dimensions ||
    !artwork.collection ||
    !image
  ) {
    console.log("Missing artwork fields!");

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "No artwork received!",
      },
    });
  }

  console.log("collection id in service: " + artwork.collection);

  try {
    // To Do: insert artwork image into gallery_photos with order 1
    const path = await uploadFile(supabase, image, "artwork_images");

    const imageUrl = typeof path === "string" ? path : (path.path ?? "");

    const parsedPrice = Number(artwork.price);

    const { data, error } = await supabase
      .from("artworks")
      .insert({
        title: artwork.title,
        description: artwork.description,
        price: parsedPrice,
        dimensions: artwork.dimensions,
        year: artwork.year ? Number(artwork.year) : null,
        medium: artwork.medium || null,
        collection_id: artwork.collection,
        artwork_note: artwork.artwork_note || "",
        image_path: imageUrl,
        cover_image: artwork.cover_image || false,
      })
      .select("id");

    if (error) {
      console.error("Error inserting artwork into database:", error); // error is null?
      throw createError({
        statusCode: 500,
        statusMessage: "Internal Error",
        data: {
          message: "Failed to add artwork to database!",
          details: error?.message || "Unknown error",
        },
      });
    }

    const id = data[0].id;

    await addGalleryImage(supabase, id, image);

    return data;
  } catch (err) {
    console.log("Error: " + err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to upload artwork!",
      },
    });
  }
}

async function updateArtwork(
  supabase: SupabaseClient<Database>,
  id: string,
  artwork: ArtworkData,
) {
  if (!id || !artwork || !supabase) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "No artwork received!",
      },
    });
  }

  if (
    !artwork.title ||
    !artwork.description ||
    !artwork.price ||
    !artwork.dimensions
  ) {
    throw new Error("Missing artwork fields!");
  }

  let parsedPrice: number;
  try {
    parsedPrice = Number(artwork.price);
  } catch (err) {
    console.log("Error parsing price: " + err);
    throw new Error("Invalid price value!");
  }
  try {
    await supabase
      .from("artworks")
      .update({
        title: artwork.title,
        description: artwork.description,
        price: parsedPrice,
        dimensions: artwork.dimensions,
        year: artwork.year ? Number(artwork.year) : null,
        medium: artwork.medium || null,
        artwork_note: artwork.artwork_note || "",
        cover_image: artwork.cover_image || false,
      })
      .eq("id", id);
  } catch (err) {
    console.log("failed to update artist:", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to update artist",
      },
    });
  }
}

async function deleteArtwork(supabase: SupabaseClient<Database>, id: string) {
  console.log("deleting artwork...");

  if (!supabase || !id) {
    throw new Error("Missing parameters!");
  }

  // look up artist for image_path
  const { data: artwork, error } = await supabase
    .from("artworks")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !artwork || !artwork.image_path) {
    throw new Error("Failed to retrieve artwork!");
  }

  try {
    await deleteFile(supabase, artwork.image_path, "artwork_images");
  } catch (err) {
    console.log("Failed to delete file: " + err);
    throw new Error("Failed to delete artwork image");
  }

  // delete gallery images if they exist
  const { error: galleryError, data: gallery } = await supabase
    .from("gallery_images")
    .select("id, image_path")
    .eq("artwork_id", id);

  if (galleryError || !gallery) {
    console.log("No gallery images to delete!");
    return;
  }
  try {
    await Promise.all(
      gallery.map((image) =>
        deleteFile(supabase, image.image_path!, "gallery_images"),
      ),
    );
  } catch (err) {
    console.log("Failed to delete gallery images: " + err);
    throw new Error("Failed to delete images from storage!");
  }

  const { error: deleteGalleryError } = await supabase
    .from("gallery_images")
    .delete()
    .eq("artwork_id", id);

  if (deleteGalleryError) {
    throw new Error(
      "Failed to delete the gallery: " + deleteGalleryError.message,
    );
  }

  // delete artwork from artists table
  const { error: deleteError } = await supabase
    .from("artworks")
    .delete()
    .eq("id", id);
  if (deleteError) {
    console.log("failed to delete artwork: " + deleteError?.message);
    throw new Error("Failed to delete artwork!");
  }

  // try {
  //   await deleteGalleryImagesForArtwork(supabase, id);
  // } catch (err) {
  //   console.log("Failed to delete gallery images for artwork: " + err);
  //   throw new Error("Failed to delete gallery images for artwork!");
  // }
}

async function getArtworkDetails(
  supabase: SupabaseClient<Database>,
  id: string,
) {
  console.log("getting artwork details!");

  if (!supabase || !id) {
    throw new Error("Missing parameters!");
  }

  const { data, error } = await supabase
    .from("artworks")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.log("failed to retrieve artwork details: " + JSON.stringify(error));
    throw new Error("Failed to retrieve artwork from supabase!");
  }

  const imagePath = data?.image_path;

  const { data: publicData } = await supabase.storage
    .from("artwork_images")
    .getPublicUrl(imagePath || "");

  const publicUrl = publicData?.publicUrl || null;

  return { ...data, image_path: publicUrl };
}

async function getArtworkPrice(supabase: SupabaseClient<Database>, id: string) {
  console.log("getting artwork price!");

  if (!supabase || !id) {
    throw new Error("Missing parameters!");
  }

  const { data, error } = await supabase
    .from("artworks")
    .select("price")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.log("failed to retrieve artwork price: " + error?.message);
    throw new Error("Failed to retrieve artwork price!");
  }

  const price = data?.price;

  if (!price) {
    throw new Error("Artwork price is null or undefined!");
  }

  const amount = Math.round(Number(price) * 100); // Convert to cents

  return amount;
}

async function getArtworkCount(supabase: SupabaseClient<Database>) {
  const { count: artworkCount, error: artError } = await supabase
    .from("artworks")
    .select("id", { count: "exact", head: true });

  if (artError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch total artwork count",
        details: artError.message,
      },
    });
  }

  return artworkCount || 0;
}

async function getSoldArtworkCount(supabase: SupabaseClient<Database>) {
  const { count: artworkCount, error: artError } = await supabase
    .from("artworks")
    .select("id", { count: "exact", head: true })
    .eq("sold", true);

  if (artError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch total artwork count",
        details: artError.message,
      },
    });
  }

  return artworkCount || 0;
}

async function getArtworks(supabase: SupabaseClient<Database>) {
  const { data: artworks, error } = await supabase
    .from("artworks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !artworks) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch artworks",
        details: error?.message,
      },
    });
  }

  artworks.map((artwork) => {
    const imagePath = artwork.image_path;
    if (imagePath) {
      const { data: publicData } = supabase.storage
        .from("artwork_images")
        .getPublicUrl(imagePath);
      artwork.image_path = publicData?.publicUrl;
    }
  });

  return artworks;
}

async function getCollectionArtworks(
  supabase: SupabaseClient<Database>,
  collectionId: string,
) {
  if (!supabase || !collectionId) {
    console.log("Missing paremeters");
    throw new Error("Missing parameters");
  }

  const { data: artworks, error } = await supabase
    .from("artworks")
    .select("*")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false });

  if (error || !artworks) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch artworks",
        details: error?.message,
      },
    });
  }

  artworks.map((artwork) => {
    const imagePath = artwork.image_path;
    if (imagePath) {
      const { data: publicData } = supabase.storage
        .from("artwork_images")
        .getPublicUrl(imagePath);
      artwork.image_path = publicData?.publicUrl;
    }
  });

  return artworks;
}

async function getLatestArtwork(supabase: SupabaseClient<Database>) {
  if (!supabase) {
    throw new Error("Missing supabase client!");
  }

  const { data: artworks, error } = await supabase
    .from("artworks")
    .select("*")
    .eq("sold", false)
    // .eq("cover_image", true)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !artworks || artworks.length === 0) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch latest artwork",
        details: error?.message,
      },
    });
  }

  // const artwork = artworks[0];
  for (const artwork of artworks) {
    // Get public URL for the image
    if (artwork.image_path) {
      const { data: publicData } = supabase.storage
        .from("artwork_images")
        .getPublicUrl(artwork.image_path);
      artwork.image_path = publicData?.publicUrl;

      if (!publicData) {
        console.log("Error fetching public URL: ");
        throw new Error("Failed to fetch public URL for artwork image!");
      }
    }
  }

  return artworks;
}

async function getCoverImages(supabase: SupabaseClient<Database>) {
  if (!supabase) {
    throw new Error("Missing supabase client!");
  }

  const { data: artworks, error } = await supabase
    .from("cover_images")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !artworks || artworks.length === 0) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch latest artwork",
        details: error?.message,
      },
    });
  }

  // const artwork = artworks[0];
  for (const artwork of artworks) {
    // Get public URL for the image
    if (artwork.image_path) {
      const { data: publicData } = supabase.storage
        .from("cover_images")
        .getPublicUrl(artwork.image_path);
      artwork.image_path = publicData?.publicUrl;

      if (!publicData) {
        console.log("Error fetching public URL: ");
        throw new Error("Failed to fetch public URL for artwork image!");
      }
    }
  }

  return artworks;
}

async function addCoverImage(
  supabase: SupabaseClient<Database>,
  image: UploadInput,
) {
  console.log("Adding gallery images...");

  if (!supabase || !image) {
    throw new Error("Missing parameters!");
  }

  try {
    const imagePath = await uploadFile(supabase, image, "cover_images");

    // 3.) insert each gallery image record with path into gallery_images table
    if (!imagePath) {
      throw new Error("Failed to get image path for gallery image!");
    }
    const { error } = await supabase.from("cover_images").insert({
      image_path: imagePath.path,
    });

    if (error) {
      throw new Error(
        `Failed to insert gallery image record: ${error.message}`,
      );
    }
  } catch (err) {
    console.log("Failed to upload gallery image:", err);
    throw new Error("Failed to upload gallery image!");
  }
}

async function getArtworkForCollection(
  supabase: SupabaseClient<Database>,
  collectionId: string,
) {
  if (!supabase || !collectionId) {
    throw new Error("Missing parameters!");
  }

  const { data: artworks, error } = await supabase
    .from("artworks")
    .select("image_path")
    .eq("sold", false)
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !artworks || artworks.length === 0) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch latest artwork",
        details: error?.message,
      },
    });
  }

  const artwork = artworks[0];

  // Get public URL for the image
  if (artwork.image_path) {
    const { data: publicData } = supabase.storage
      .from("artwork_images")
      .getPublicUrl(artwork.image_path);
    artwork.image_path = publicData?.publicUrl;

    if (!publicData) {
      console.log("Error fetching public URL: ");
      throw new Error("Failed to fetch public URL for artwork image!");
    }
  }

  return artwork; // artwork.image_path
}

async function markArtworkAsSold(
  supabase: SupabaseClient<Database>,
  artworkId: string,
) {
  if (!supabase || !artworkId) {
    throw new Error("Missing parameters!");
  }

  const { error } = await supabase
    .from("artworks")
    .update({ sold: true, updated_at: new Date().toISOString() })
    .eq("id", artworkId);

  if (error) {
    throw new Error(
      `Failed to mark artwork ${artworkId} as sold: ${error.message}`,
    );
  }
}

async function getGalleryImages(
  supabase: SupabaseClient<Database>,
  artworkId: string,
) {
  if (!supabase || !artworkId) {
    throw new Error("Missing parameters!");
  }

  const { data: rows, error } = await supabase
    .from("gallery_images")
    .select("*")
    .eq("artwork_id", artworkId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch gallery images:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch gallery images",
        details: error.message,
      },
    });
  }

  // Map image_path to public URLs
  if (rows && Array.isArray(rows)) {
    rows.map((row) => {
      const imagePath = row.image_path;
      if (imagePath) {
        const { data: publicData } = supabase.storage
          .from("gallery_images")
          .getPublicUrl(imagePath);
        // @ts-ignore assign back
        row.image_path = publicData?.publicUrl ?? null;
      }
    });
  }

  return rows;
}

async function deleteGalleryImage(
  supabase: SupabaseClient<Database>,
  id: string,
) {
  if (!supabase || !id) {
    throw new Error("Missing parameters!");
  }

  // Verify image exists
  const { data: existingImage, error } = await supabase
    .from("gallery_images")
    .select("id, image_path")
    .eq("id", id)
    .single();

  if (
    error ||
    !existingImage ||
    !existingImage.image_path ||
    !existingImage.id
  ) {
    console.log("Error - image doesnt exist");
    throw new Error("Gallery image doesn't exist!");
  }

  const imagePath = existingImage?.image_path;

  try {
    await deleteFile(supabase, imagePath, "gallery_images");
    console.log("File deleted!");
    await supabase.from("gallery_images").delete().eq("id", existingImage.id);
  } catch (err) {
    console.log("Failed to delete file: " + err);
    throw new Error("Failed to delete the image!");
  }
}

// new helper for cover images
async function deleteCoverImage(
  supabase: SupabaseClient<Database>,
  id: string,
) {
  if (!supabase || !id) {
    throw new Error("Missing parameters!");
  }

  // Verify cover image exists
  const { data: existingImage, error } = await supabase
    .from("cover_images")
    .select("id, image_path")
    .eq("id", parseInt(id)) // TO DO: delete later - we need ID to be string in supabase
    .single();

  if (
    error ||
    !existingImage ||
    !existingImage.image_path ||
    !existingImage.id
  ) {
    console.log("Error - cover image doesnt exist");
    throw new Error("Cover image doesn't exist!");
  }

  const imagePath = existingImage.image_path;

  try {
    await deleteFile(supabase, imagePath, "cover_images");
    console.log("Cover file deleted!");
    await supabase.from("cover_images").delete().eq("id", existingImage.id);
  } catch (err) {
    console.log("Failed to delete cover file: " + err);
    throw new Error("Failed to delete the cover image!");
  }
}

async function deleteGalleryImagesForArtwork(
  supabase: SupabaseClient<Database>,
  artworkId: string,
) {
  if (!supabase || !artworkId) {
    throw new Error("Missing parameters!");
  }

  const { data: gallery, error } = await supabase
    .from("gallery_images")
    .select("id, image_path")
    .eq("artwork_id", artworkId);

  if (error) {
    console.log("Failed to fetch gallery images: " + error);
    throw new Error("Failed to fetch gallery images for artwork!");
  }

  const { error: deleteError } = await supabase
    .from("gallery_images")
    .delete()
    .eq("artwork_id", artworkId);

  if (deleteError) {
    console.log(
      "Failed to delete gallery image records: " + deleteError?.message,
    );
    throw new Error("Failed to delete gallery image records for artwork!");
  }
}

async function addGalleryImages(
  supabase: SupabaseClient<Database>,
  artworkId: string,
  images: UploadInput[],
) {
  console.log("Adding gallery images...");

  if (!supabase || !artworkId || !images) {
    throw new Error("Missing parameters!");
  }

  if (!artworkId || !images || images.length === 0) {
    throw new Error("Invalid gallery form data!");
  }

  // To Do:
  // 1.) validate artwork ID exists
  const { data: existingArtwork, error: fetchError } = await supabase
    .from("artworks")
    .select("id")
    .eq("id", artworkId)
    .single();

  if (fetchError || !existingArtwork) {
    console.log("Failed to fetch artwork:", fetchError);
    throw new Error("Artwork does not exist!");
  }

  // 2.) upload each image to get the path
  for (const image of images) {
    try {
      const imagePath = await uploadFile(supabase, image, "gallery_images");
      const { data: lastImage } = await supabase
        .from("gallery_images")
        .select("order")
        .eq("artwork_id", artworkId)
        .order("order", { ascending: false })
        .limit(1)
        .single();

      const nextOrder = lastImage ? lastImage.order + 1 : 1;
      // 3.) insert each gallery image record with path into gallery_images table
      if (!imagePath) {
        throw new Error("Failed to get image path for gallery image!");
      }
      const { error } = await supabase.from("gallery_images").insert({
        artwork_id: artworkId,
        image_path: imagePath.path,
        order: nextOrder,
      });

      if (error) {
        throw new Error(
          `Failed to insert gallery image record: ${error.message}`,
        );
      }
    } catch (err) {
      console.log("Failed to upload gallery image:", err);
      throw new Error("Failed to upload gallery image!");
    }
  }
}

async function addGalleryImage(
  supabase: SupabaseClient<Database>,
  artworkId: string,
  image: UploadInput,
) {
  console.log("Adding gallery images...");

  if (!supabase || !artworkId || !image) {
    throw new Error("Missing parameters!");
  }

  // const artworkId = galleryForm.artworkId;
  // const images: File[] | null = galleryForm.images; // To Do: figure out this type error
  console.log("artwork id: " + artworkId);

  if (!artworkId || !image) {
    throw new Error("Invalid gallery form data!");
  }

  // To Do:
  // 1.) validate artwork ID exists
  const { data: existingArtwork, error: fetchError } = await supabase
    .from("artworks")
    .select("id")
    .eq("id", artworkId)
    .single();

  if (fetchError || !existingArtwork) {
    console.log("Failed to fetch artwork:", fetchError);
    throw new Error("Artwork does not exist!");
  }
  // RLS error here
  try {
    const imagePath = await uploadFile(
      supabase,
      image, // how to change to file?
      "gallery_images",
    );
    const { data: lastImage } = await supabase
      .from("gallery_images")
      .select("order")
      .eq("artwork_id", artworkId)
      .order("order", { ascending: false })
      .limit(1)
      .single();

    const nextOrder = lastImage ? lastImage.order + 1 : 1;
    // 3.) insert each gallery image record with path into gallery_images table
    if (!imagePath) {
      throw new Error("Failed to get image path for gallery image!");
    }
    const { error } = await supabase.from("gallery_images").insert({
      artwork_id: artworkId,
      image_path: imagePath.path,
      order: nextOrder,
    });

    if (error) {
      throw new Error(
        `Failed to insert gallery image record: ${error.message}`,
      );
    }
  } catch (err) {
    console.log("Failed to upload gallery image:", err);
    throw new Error("Failed to upload gallery image!");
  }
}

export {
  addArtwork,
  getArtworkDetails,
  updateArtwork,
  deleteArtwork,
  getArtworkCount,
  getSoldArtworkCount,
  getArtworks,
  markArtworkAsSold,
  getArtworkPrice,
  getLatestArtwork,
  getGalleryImages,
  addGalleryImages,
  deleteGalleryImage,
  deleteCoverImage,
  deleteGalleryImagesForArtwork,
  getArtworkForCollection,
  getCollectionArtworks,
  getCoverImages,
  addCoverImage,
};
