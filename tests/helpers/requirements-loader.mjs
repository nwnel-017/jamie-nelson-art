import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../canva-app/package.json", import.meta.url),
);
const { transform } = require("@swc/core");

// Use the same SWC runtime and message transform as the Canva Jest suite.
export default function transformCanva(source) {
  const done = this.async();
  transform(source, {
    filename: this.resourcePath,
    jsc: {
      parser: { syntax: "typescript", tsx: true },
      transform: { react: { runtime: "automatic" } },
      experimental: {
        plugins: [
          [
            require.resolve("@swc/plugin-formatjs"),
            {
              idInterpolationPattern: "[sha512:contenthash:base64:6]",
              ast: true,
            },
          ],
        ],
        cacheRoot: this.getOptions().cacheRoot,
      },
    },
  }).then(({ code }) => done(null, code), done);
}
