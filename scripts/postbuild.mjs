// SPA fallback for hosts that serve 404.html (GitHub Pages, Firebase, etc.).
import { copyFileSync, existsSync } from "node:fs";
if (existsSync("dist/index.html")) copyFileSync("dist/index.html", "dist/404.html");
