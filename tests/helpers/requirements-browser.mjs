import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const canva = fileURLToPath(new URL("../../canva-app/", import.meta.url));
const require = createRequire(`${canva}package.json`);
const { rspack } = require("@rspack/core");

export async function buildRequirementsBrowser(output) {
  const compiler = rspack({
    mode: "development",
    context: canva,
    entry: `${canva}tests/requirements-host.tsx`,
    output: { path: output, filename: "app.js" },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "@canva/user$": `${canva}tests/canva-user.ts`,
        styles: `${canva}styles`,
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          loader: fileURLToPath(
            new URL("./requirements-loader.mjs", import.meta.url),
          ),
          options: { cacheRoot: `${output}/swc` },
        },
        { test: /\.css$/, include: `${canva}styles`, type: "css/module" },
        { test: /\.css$/, exclude: `${canva}styles`, type: "css/auto" },
      ],
    },
  });
  try {
    await new Promise((resolve, reject) =>
      compiler.run((error, stats) => {
        if (error) reject(error);
        else if (stats.hasErrors())
          reject(new Error(stats.toString({ all: false, errors: true })));
        else resolve();
      }),
    );
  } finally {
    await new Promise((resolve, reject) =>
      compiler.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
