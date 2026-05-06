import fs from "node:fs/promises";
import path from "node:path";

const BUILD_COMMAND =
  "cd jarvis/desktop && npm install && npm run dist:win:all && npm run publish:download";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawArch = searchParams.get("arch");
  const arch = rawArch === "arm64" ? "arm64" : "x64";

  const filePath = path.join(
    process.cwd(),
    "public",
    "jarvis",
    `JarvisSetup-${arch}.exe`,
  );

  try {
    await fs.access(filePath);
  } catch {
    return Response.json(
      {
        error: "Installer not yet available",
        arch,
        instructions: `Build the installer first: ${BUILD_COMMAND}`,
      },
      { status: 503 },
    );
  }

  const fileBuffer = await fs.readFile(filePath);

  return new Response(fileBuffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="JarvisSetup-${arch}.exe"`,
      "Content-Length": String(fileBuffer.byteLength),
    },
  });
}
