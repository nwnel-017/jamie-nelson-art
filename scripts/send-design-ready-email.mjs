const required = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "ADMIN_EMAIL",
  "DESIGN_PREVIEW_URL",
  "DESIGN_PR_URL",
  "DESIGN_PR_NUMBER",
  "DESIGN_HEAD_SHA",
];

for (const key of required) {
  if (!process.env[key]?.trim()) throw new Error(`Missing ${key}.`);
}

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character],
  );

const previewUrl = new URL(process.env.DESIGN_PREVIEW_URL);
const prUrl = new URL(process.env.DESIGN_PR_URL);
if (previewUrl.protocol !== "https:" || prUrl.protocol !== "https:") {
  throw new Error("Preview and pull request links must use HTTPS.");
}

const prNumber = process.env.DESIGN_PR_NUMBER;
const previewLink = escapeHtml(previewUrl.toString());
const pullRequestLink = escapeHtml(prUrl.toString());
const idempotencyKey = `design-ready/${prNumber}/${process.env.DESIGN_HEAD_SHA}`;
const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  },
  body: JSON.stringify({
    from: process.env.RESEND_FROM_EMAIL,
    to: [process.env.ADMIN_EMAIL],
    subject: `Website changes are ready to review (PR #${prNumber})`,
    html: `<p>Your site changes are ready to review.</p><p><a href="${previewLink}">Open the Vercel preview</a></p><p><a href="${pullRequestLink}">Review the pull request</a></p>`,
    text: `Your site changes are ready to review.\n\nVercel preview: ${previewUrl}\nPull request: ${prUrl}`,
  }),
});

if (!response.ok) {
  const details = await response.text();
  throw new Error(`Resend rejected the email (${response.status}): ${details}`);
}

const result = await response.json();
if (!result.id) throw new Error("Resend did not return an email ID.");
console.log(`Ready-for-review email accepted by Resend: ${result.id}`);
