// Bundles src/main.js (+ three.js and the JSON course data) into app.js,
// which index.html loads. Run: npm install && npm run build
import * as esbuild from "esbuild";

const options = {
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  minify: true,
  loader: { ".json": "json" },
  outfile: "app.js",
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
