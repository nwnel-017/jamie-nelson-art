import { fileURLToPath } from "url";
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  app: {
    head: {
      title: "Jamie Nelson Art",
      htmlAttrs: {
        lang: "en",
      },
      link: [
        { rel: "icon", type: "image/x-icon", href: "/favicon.svg" },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/apple-touch-icon.png",
        },
      ],
      meta: [
        { name: "color-scheme", content: "light" },
        {
          name: "description",
          content:
            "Discover unique artworks by Jamie Nelson. Shop original mixed media artworks to inspire your home",
        },
      ],
    },
  },
  css: ["~/assets/styles/main.css"],
  modules: ["@nuxt/eslint", "@nuxtjs/supabase", "nuxt-lottie", "@nuxt/image", "nuxt-svgo"],
  image: {
    domains: process.env.SUPABASE_DOMAIN ? [process.env.SUPABASE_DOMAIN] : [],
  },
  lottie: {
    componentName: "Lottie", // Optional: Customize the component name
    lottieFolder: "/assets/lottie", // Optional: Customize the Lottie folder path
    autoFolderCreation: true, // Optional: Auto create lottie folder (default: true)
    enableLogs: true, // Optional: Enable console logs from module (default: true)
  },
  supabase: {
    types: "~~/types/supabase/database.ts",
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    redirect: false,
  },

  runtimeConfig: {
    maxAnalyzeAttempts: 4,
    planningGithubToken: "",
    planningRepository: "nwnel-017/jamie-nelson-art",
    planningRepositoryId: "",
    planningWorkflowRef: "master",
    planningSourceRef: "master",
    planningBackendUrl: "",
    planningCodexModel: "",
    planningGithubWebhookSecret: "",
    aiProvider: "test",
    aiApiKey: "",
    aiModel: "",
    aiBaseUrl: "https://api.openai.com/v1",
    canvaAppId: "AAHOGIFETu8",
    canvaAllowedUserIds: "",
    canvaAllowUnlistedLocalUsers: false,
    canvaExportHosts: "export-download.canva.com",
    canvaAppOrigin: "https://app-aahogifetu8.canva-apps.com",
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

    public: {
      isVercelPreview: process.env.IS_VERCEL_PREVIEW === "true",
      supabaseUrl: process.env.SUPABASE_URL,
      admin: process.env.ADMIN_EMAIL,
      stripeDomesticShippingId: process.env.STRIPE_SHIPPING_ID_DOMESTIC,
      stripeInternationalShippingId:
        process.env.STRIPE_SHIPPING_ID_INTERNATIONAL,
    },
  },
  alias: {
    "@server": fileURLToPath(new URL("./server", import.meta.url)),
    "#types": fileURLToPath(new URL("./types", import.meta.url)),
    "@utils": fileURLToPath(new URL("./utils", import.meta.url)),
  },
});
