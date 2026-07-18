const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const entries = [
  "index.html",
  "admin.html",
  "confirm-email.html",
  "seguranca-infantil.html",
  "manifest.json",
  "service-worker.js",
  "vercel.json",
  "_redirects",
  "assets",
  "auth",
  ".well-known",
  "src"
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const entry of entries) {
  const source = path.join(root, entry);
  if (!fs.existsSync(source)) continue;
  const target = path.join(dist, entry);
  copyRecursive(source, target);
}

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      copyRecursive(path.join(source, child), path.join(target, child));
    }
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
