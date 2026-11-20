import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const canva = fileURLToPath(new URL("../../canva-app/", import.meta.url));
const require = createRequire(`${canva}package.json`);
const rootRequire = createRequire(
  new URL("../../package.json", import.meta.url),
);
const root = fileURLToPath(new URL("../../", import.meta.url));
const { rspack } = require("@rspack/core");

export async function buildRequirementsHarness(output) {
  const boundaries = `${root}tests/helpers/requirements-boundaries.ts`;
  const compiler = rspack([
    {
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
    },
    {
      mode: "development",
      target: "node22",
      entry: `${root}tests/helpers/requirements-server.ts`,
      output: {
        path: output,
        filename: "server.mjs",
        chunkFilename: "[id].mjs",
        library: { type: "module" },
      },
      externalsType: "module",
      externals: [
        ({ request }, callback) => {
          if (
            request.startsWith(".") ||
            request.startsWith("/") ||
            request.startsWith("@server") ||
            request === "#supabase/server"
          )
            return callback();
          callback(null, rootRequire.resolve(request));
        },
      ],
      resolve: {
        extensions: [".ts", ".js"],
        alias: {
          "@server/utils/agent/model-factory$": boundaries,
          "#supabase/server$": boundaries,
          "./image$": boundaries,
          "@server": `${root}server`,
        },
      },
      module: {
        rules: [
          {
            test: /\.ts$/,
            exclude: /node_modules/,
            loader: "builtin:swc-loader",
            options: { jsc: { parser: { syntax: "typescript" } } },
          },
        ],
      },
    },
  ]);
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
