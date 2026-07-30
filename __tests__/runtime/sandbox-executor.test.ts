import { readFileSync } from "node:fs";
import path from "node:path";

describe("runtime sandbox executor process launch", () => {
  it("keeps sandbox child processes hidden on Windows", () => {
    const source = readFileSync(path.join(process.cwd(), "src/backend/runtime/sandbox-executor.ts"), "utf8");

    expect(source).toMatch(/spawn\(command,\s*args,\s*\{[\s\S]*windowsHide:\s*true[\s\S]*\}\)/);
  });
});
