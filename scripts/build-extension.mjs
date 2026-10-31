import { build } from "esbuild";
import { readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const review = process.argv.includes("--review");
const clientId = review ? undefined : process.env.TYPEFLOW_EXTENSION_CLIENT_ID;
const website = process.env.TYPEFLOW_WEBSITE_URL;
const key = process.env.TYPEFLOW_EXTENSION_PUBLIC_KEY;
if (
  !review &&
  (!clientId ||
    !/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
    !website ||
    !key)
)
  throw new Error(
    "Production packaging requires TYPEFLOW_EXTENSION_CLIENT_ID, TYPEFLOW_EXTENSION_PUBLIC_KEY, and TYPEFLOW_WEBSITE_URL. Use --review for an explicitly unconfigured review build.",
  );
if (website) {
  const url = new URL(website);
  if (
    url.protocol !== "https:" ||
    url.origin !== website ||
    url.hostname.endsWith(".example") ||
    url.hostname === "example.com"
  )
    throw new Error(
      "TYPEFLOW_WEBSITE_URL must be a real HTTPS origin, without a trailing slash or path.",
    );
}
if (key) {
  try {
    const der = createPublicKey({
      key: Buffer.from(key, "base64"),
      type: "spki",
      format: "der",
    }).export({ type: "spki", format: "der" });
    const id = createHash("sha256")
      .update(der)
      .digest("hex")
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (n) => String.fromCharCode(97 + parseInt(n, 16)));
    console.log(
      `Configured Chrome extension ID: ${id}. Compare with the store item and OAuth Application ID.`,
    );
  } catch {
    throw new Error(
      "TYPEFLOW_EXTENSION_PUBLIC_KEY must be the store item's base64 DER public key.",
    );
  }
}
const name = review ? "typeflow-1.0.0-review" : "typeflow-1.0.0";
const outdir = `release/${name}`;
await rm(outdir, { recursive: true, force: true });
await rm(`release/${name}.zip`, { force: true });
await mkdir(`${outdir}/icons`, { recursive: true });
const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
if (clientId) manifest.oauth2.client_id = clientId;
else delete manifest.oauth2;
manifest.homepage_url = website || "https://typeflow-type-flow1.vercel.app";
if (key) manifest.key = key;
await writeFile(
  `${outdir}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
await copyFile("extension/sidepanel.html", `${outdir}/sidepanel.html`);
await build({
  entryPoints: {
    panel: "extension/src/panel.tsx",
    background: "extension/src/background.ts",
  },
  outdir,
  bundle: true,
  minify: true,
  format: "esm",
  target: "chrome120",
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": '"production"',
    TYPEFLOW_WEBSITE_URL: JSON.stringify(
      website || "https://typeflow-type-flow1.vercel.app",
    ),
  },
  tsconfig: "tsconfig.json",
  legalComments: "eof",
});
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="28" fill="#2468df"/><g fill="#fff"><rect x="28" y="37" width="72" height="10" rx="5"/><rect x="28" y="59" width="52" height="10" rx="5"/><rect x="28" y="81" width="32" height="10" rx="5"/></g></svg>`;
for (const size of [16, 32, 48, 128])
  await sharp(Buffer.from(icon))
    .resize(size, size)
    .png()
    .toFile(`${outdir}/icons/${size}.png`);
await copyFile(`${outdir}/icons/128.png`, "release/store/icon-128.png");
const licenses = [];
for (const dependency of ["react", "react-dom", "scheduler", "lucide-react"]) {
  const resolver =
    dependency === "scheduler"
      ? createRequire(require.resolve("react-dom/package.json"))
      : require;
  const packagePath = resolver.resolve(`${dependency}/package.json`);
  licenses.push(
    `${dependency}\n${await readFile(path.join(path.dirname(packagePath), "LICENSE"), "utf8")}`,
  );
}
await writeFile(`${outdir}/THIRD_PARTY_LICENSES.txt`, licenses.join("\n\n"));
await writeFile(
  `${outdir}/RELEASE.txt`,
  review
    ? "REVIEW BUILD — OAuth client and public website must be configured before publication. Not a production upload.\n"
    : "TypeFlow 1.0.0 production build. Complete real-account release acceptance checks before publication.\n",
);
execFileSync("zip", ["-q", "-r", `../${name}.zip`, "."], { cwd: outdir });
const zip = await readFile(`release/${name}.zip`);
await writeFile(
  `release/${name}.zip.sha256`,
  `${createHash("sha256").update(zip).digest("hex")}  ${name}.zip\n`,
);
console.log(
  `Built release/${name}.zip (${zip.length} bytes). ${review ? "UNCONFIGURED REVIEW BUILD." : "Production configuration embedded; real-account acceptance still required."}`,
);
