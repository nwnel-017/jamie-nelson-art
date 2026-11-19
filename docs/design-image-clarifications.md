## Problem Statement

Design requests can contain logos, product photos, portraits, and other exact image assets that cannot be faithfully recreated from the exported design screenshot. Clarification currently accepts text only, so users cannot supply those assets and the agent cannot reliably use them in the generated website.

## Solution

During requirements gathering, identify exact image assets needed from the user and ask image clarification questions alongside text questions. Each image question provides an upload button, displays the filename, and accepts an optional note. Validate files before uploading them to public Supabase Storage. Let the agent inspect uploaded images, resolve suitability concerns with the user, and carry stable image URLs into approved requirements and generated code.

## User Stories

1. As a Canva user, I want the agent to identify exact images needed from my design, so that the website uses the intended assets.
2. As a Canva user, I want simple decorative shapes and backgrounds recreated without unnecessary upload requests, so that clarification stays focused.
3. As a Canva user, I want each image question to name one specific asset and its intended use, so that I know what to upload.
4. As a Canva user, I want repeated uses of the same image covered by one upload, so that I do not supply duplicate files.
5. As a Canva user, I want an upload button for image questions, so that I can choose a file from my machine.
6. As a Canva user, I want to supply PNG, JPEG, or WebP files up to 5 MB each, so that I can use common website image formats.
7. As a Canva user, I want an oversized-file message asking for a smaller image, so that I can correct the upload.
8. As a Canva user, I want unsupported or invalid files rejected before public storage, so that only validated images are accepted.
9. As a Canva user, I want a notice that uploads become publicly accessible, so that I understand what uploading means.
10. As a Canva user, I want to see the selected filename, so that I can confirm my selection.
11. As a Canva user, I want to replace my selected image before submission, so that I can correct a mistake.
12. As a Canva user, I want to add an optional text note to an image answer, so that I can explain how it should be used.
13. As a Canva user, I want the agent to inspect the supplied image, so that clarification accounts for its actual contents.
14. As a Canva user, I want the agent to explain suitability concerns, so that I can make an informed choice.
15. As a Canva user, I want to keep a valid image despite an agent concern or upload a replacement, so that I retain control over the asset.
16. As a Canva user, I want required images to remain unresolved until uploaded, so that the agent cannot silently substitute placeholders.
17. As a Canva user, I want a simple error and retry path for failed uploads, so that I can try again.
18. As a Canva user, I want supplied images carried through requirements approval and generation, so that the final site uses the correct assets.
19. As a site visitor, I want published images to use stable public URLs, so that images remain available without expiring access links.
20. As a site owner, I want uploaded images retained indefinitely for now, so that generated sites and pending changes do not lose their assets.
21. As a site owner, I want uploads associated with their design request and question, so that assets cannot be accidentally attached to another user's request.

## Implementation Decisions

- Extend requirements gathering prompts and structured output to distinguish text questions from image questions. Preserve existing text clarification behavior.
- Request images whose identity or appearance must match the design, including logos, product photos, and portraits. Recreate simple shapes, backgrounds, and decorative elements without demanding source images.
- Each image question requests one asset. Repeated design uses share that asset and URL. Uploads are supplied only in response to image questions.
- Extend the Canva clarification interface with file selection, filename display, replacement before submission, an optional note, and a public-access notice. Do not add thumbnails.
- Extend the authenticated upload and clarification contracts to associate validated attachments with a design request, question, and submitting user. Submit stored attachment identifiers rather than trusting arbitrary client-provided URLs or storage paths.
- Keep the existing draft-version and submission-id protections when processing image answers. Persist attachment references and relevant suitability decisions with the clarification history.
- Accept PNG, JPEG, and WebP up to 5 MB per image. Validate actual file content and successful image decoding before public storage. Reuse applicable existing image-validation safeguards without inheriting the design screenshot's PNG-only or Canva-source restrictions.
- Reject oversized files with an explanation and a request for a smaller image. Do not resize or compress uploads automatically.
- Store validated uploads publicly in Supabase Storage under server-controlled names. Public reads do not imply public write or delete access; modifications remain authorized.
- Keep the original selected filename available for display independently of the storage object name.
- Give the clarification agent actual image access, not just filenames or text descriptions. Retain the association between each image and its question when presenting model inputs.
- Distinguish mandatory file validation from advisory visual suitability review. Invalid files cannot be accepted. For valid images flagged as unsuitable, explain the concern and allow replacement or an explicit keep-anyway decision; do not repeatedly block on the same acknowledged concern.
- Every image question requires a valid uploaded image. Optional notes alone cannot satisfy it. No placeholders or skip option; missing images keep the request in clarification.
- Upload failures use a simple error and retry path. Do not add a specialized answer-preservation or recovery mechanism, and do not remove existing text-answer behavior as unrelated work.
- Carry stable public asset URLs and their intended uses through saved requirements, approved job input, technical planning, and execution. Generated code references those URLs directly.
- Do not download or commit supplied images into application assets. Supabase is the permanent image source, including for repeated uses.
- Retain all uploads indefinitely in this feature, including replaced and abandoned uploads. Do not implement cleanup or request expiration.
- Keep the current combined patch-size guardrail unchanged. Supplied images no longer pass through binary patches.

## Testing Decisions

- Test observable behavior and failure paths rather than helper structure, exact prompt wording, or incidental model prose. Prefer existing high-level boundaries over new testing infrastructure.
- Primary backend seam: extend the existing requirements/clarification service tests with controlled model and storage boundaries. Cover image-question output, validated attachment association, required-image enforcement, ownership isolation, visual model inputs, keep-anyway decisions, persisted draft results, and existing stale/duplicate submission handling with image answers.
- Exercise the authenticated upload boundary for supported formats, the 5 MB boundary, oversized and malformed files, unauthorized access, and validation before public storage. Verify that rejection does not create a public object.
- UI seam: extend the existing Canva clarification component tests using user interactions and mocked backend responses. Cover mixed text/image questions, file selection and filename display, replacement, optional notes, required-upload gating, public notice, simple upload errors, and suitability choices. Do not add thumbnails or placeholder controls.
- Extend existing planning/execution contract tests only as needed to show that approved asset URLs and intended uses reach generation without binary image delivery. Reuse existing design patch tests to preserve the guardrail.
- Prior art includes the current clarification service tests, Canva clarification component tests, and technical planning/execution tests. Use their existing test runners and dependency substitution patterns.
- Before implementation is committed, run relevant tests and lint/typecheck; before a pull request, run the full lint, typecheck, test, and production build checks. Report unrelated pre-existing failures without expanding scope.

## Out of Scope

- Storing supplied images in the application repository or transferring them through generated patches.
- Private temporary storage, signed runtime image URLs, or copying files from private to public storage during publication.
- Placeholders, skipping required image questions, AI image generation, or stock-image search.
- Looking up or reusing existing application assets before asking the user.
- Thumbnails, cropping, editing, automatic resizing, or compression.
- Dedicated upload recovery or answer-preservation machinery.
- Image cleanup, retention jobs, deletion policies, and request expiration.
- Removing or raising the existing patch-size guardrail.
- New batch-upload, image-gallery, or general-purpose attachment interfaces.

## Further Notes

- Public visibility starts after file validation and upload, before model suitability review or website publication. Agent suitability concerns do not make an uploaded image private.
- Permanent public Supabase URLs supersede the original proposal to copy images into application assets. This avoids the API/build workspace handoff and binary patch-size concerns, while making runtime image availability depend on Supabase Storage.
- The current patch-size ceiling is an application guardrail for the combined generated patch, not a limit on the whole website. It remains unchanged.
- Do not introduce a new combined image-size budget as part of this spec; the agreed validation limit is per image.
