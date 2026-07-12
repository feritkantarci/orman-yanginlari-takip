import type { NextConfig } from "next";
import { execSync } from "child_process";

let commitHash = "unknown";
let commitDate = "unknown";

try {
  commitHash = execSync("git rev-parse --short HEAD", { stdio: 'pipe' }).toString().trim() || "unknown";
  
  const isoDate = execSync("git log -1 --format=%cI", { stdio: 'pipe' }).toString().trim();
  if (isoDate) {
    const d = new Date(isoDate);
    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    commitDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
} catch (e) {
  console.log("Git bilgisi alinamadi");
}

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
    NEXT_PUBLIC_COMMIT_DATE: commitDate,
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || "1.0.1",
  }
};

export default nextConfig;
