import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadInput } from "./storage.service";
import type { ArtistProfile } from "#types/profile/profile";
import { deleteFile, uploadFile } from "./storage.service";

type ProfileRow = {
  bio: string;
  profile_image_path: string | null;
  updated_at: string;
};

const bucket = "profile_images";

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function formatProfile(
  supabase: SupabaseClient,
  profile: ProfileRow,
): ArtistProfile {
  const imageUrl = profile.profile_image_path
    ? supabase.storage.from(bucket).getPublicUrl(profile.profile_image_path).data
        .publicUrl
    : null;

  return {
    bio: profile.bio,
    imageUrl,
    updatedAt: profile.updated_at,
  };
}

async function getProfile(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("artist_profile")
    .select("bio, profile_image_path, updated_at")
    .eq("id", true)
    .single<ProfileRow>();

  if (error || !data) {
    throw new Error("Failed to retrieve artist profile");
  }

  return formatProfile(supabase, data);
}

async function updateProfile(
  supabase: SupabaseClient,
  bio: string,
  image?: UploadInput,
) {
  const { data: current, error: currentError } = await supabase
    .from("artist_profile")
    .select("profile_image_path")
    .eq("id", true)
    .single<{ profile_image_path: string | null }>();

  if (currentError || !current) {
    throw new Error("Failed to retrieve artist profile");
  }

  let uploadedPath: string | null = null;

  if (image) {
    const extension = imageExtensions[image.contentType || ""] || "jpg";
    const upload = await uploadFile(
      supabase,
      { ...image, filename: `profile-${crypto.randomUUID()}.${extension}` },
      bucket,
    );
    uploadedPath = upload.path;
  }

  let previousPath = current.profile_image_path;
  let updatedProfile: ProfileRow | null = null;

  if (!uploadedPath) {
    const { data, error } = await supabase
      .from("artist_profile")
      .update({ bio, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("bio, profile_image_path, updated_at")
      .single<ProfileRow>();

    if (error || !data) throw new Error("Failed to update artist profile");
    updatedProfile = data;
  } else {
    for (let attempt = 0; attempt < 3 && !updatedProfile; attempt += 1) {
      let update = supabase
        .from("artist_profile")
        .update({
          bio,
          profile_image_path: uploadedPath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);

      update = previousPath
        ? update.eq("profile_image_path", previousPath)
        : update.is("profile_image_path", null);

      const { data, error } = await update
        .select("bio, profile_image_path, updated_at")
        .maybeSingle<ProfileRow>();

      if (error) break;
      if (data) {
        updatedProfile = data;
        break;
      }

      const { data: latest, error: latestError } = await supabase
        .from("artist_profile")
        .select("profile_image_path")
        .eq("id", true)
        .single<{ profile_image_path: string | null }>();

      if (latestError || !latest) break;
      previousPath = latest.profile_image_path;
    }

    if (!updatedProfile) {
      await deleteFile(supabase, uploadedPath, bucket);
      throw new Error("Failed to update artist profile");
    }
  }

  if (uploadedPath && previousPath && previousPath !== uploadedPath) {
    try {
      await deleteFile(supabase, previousPath, bucket);
    } catch (error) {
      console.error("Failed to remove the previous profile image", error);
    }
  }

  return formatProfile(supabase, updatedProfile);
}

export { getProfile, updateProfile };
