const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "dist", "src");
fs.mkdirSync(dist, { recursive: true });

const assets = ["index.html", "styles.css"];
for (const file of assets) {
  fs.copyFileSync(path.join(__dirname, "..", "src", file), path.join(dist, file));
}

console.log("Static assets copied to dist/src/");
