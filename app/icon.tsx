import { readFileSync } from "fs";
import { join } from "path";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  const iconPath = join(process.cwd(), "public", "icon.png");
  const buffer = readFileSync(iconPath);
  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
