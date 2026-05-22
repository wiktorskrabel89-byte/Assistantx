import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export type SandboxExecutionLanguage = "python" | "bash" | "sql" | "typescript";

type SandboxExecutionResult = {
  language: SandboxExecutionLanguage;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

const MAX_CODE_BYTES = 40_000;
const NETWORK_GUARD_PATTERNS = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\bftp\b/i,
  /\bnc\b/i,
  /\bnetcat\b/i,
  /https?:\/\//i,
  /\/dev\/tcp\//i,
];

function validateSandboxInput(language: SandboxExecutionLanguage, code: string) {
  if (!code.trim()) throw new Error("Sandbox code is required.");
  if (Buffer.byteLength(code, "utf-8") > MAX_CODE_BYTES) {
    throw new Error("Sandbox code is too large.");
  }

  if ((language === "python" || language === "bash") && NETWORK_GUARD_PATTERNS.some((pattern) => pattern.test(code))) {
    throw new Error("Network access is blocked for Python and Bash sandbox execution.");
  }
}

async function buildExecutionFiles(language: SandboxExecutionLanguage, code: string, workdir: string) {
  switch (language) {
    case "python": {
      const filePath = path.join(workdir, "script.py");
      await writeFile(filePath, code, "utf8");
      return { command: "python3", args: ["-I", filePath] };
    }
    case "bash": {
      const filePath = path.join(workdir, "script.sh");
      await writeFile(filePath, code, "utf8");
      return { command: "bash", args: [filePath] };
    }
    case "sql": {
      const sqlPath = path.join(workdir, "query.sql");
      const runnerPath = path.join(workdir, "runner.py");
      await writeFile(sqlPath, code, "utf8");
      await writeFile(
        runnerPath,
        [
          "import json, pathlib, sqlite3, sys",
          "sql = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')",
          "conn = sqlite3.connect(':memory:')",
          "cur = conn.cursor()",
          "statements = [statement.strip() for statement in sql.split(';') if statement.strip()]",
          "for statement in statements:",
          "    cur.execute(statement)",
          "    if cur.description:",
          "        payload = {",
          "            'statement': statement,",
          "            'columns': [column[0] for column in cur.description],",
          "            'rows': cur.fetchall()[:200],",
          "        }",
          "        print(json.dumps(payload, ensure_ascii=False))",
          "conn.commit()",
        ].join("\n"),
        "utf8",
      );
      return { command: "python3", args: ["-I", runnerPath, sqlPath] };
    }
    case "typescript": {
      const filePath = path.join(workdir, "script.ts");
      await writeFile(filePath, code, "utf8");
      const repoRoot = process.cwd();
      return {
        command: path.join(repoRoot, "node_modules/.bin/ts-node"),
        args: ["--transpileOnly", filePath],
      };
    }
  }
}

export async function executeSandboxCode({
  language,
  code,
  timeoutMs,
}: {
  language: SandboxExecutionLanguage;
  code: string;
  timeoutMs: number;
}): Promise<SandboxExecutionResult> {
  validateSandboxInput(language, code);
  const workdir = await mkdtemp(path.join(tmpdir(), "assistantx-sandbox-"));

  try {
    const { command, args } = await buildExecutionFiles(language, code, workdir);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: workdir,
      TMPDIR: workdir,
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      NO_PROXY: "*",
    };

    const result = await new Promise<SandboxExecutionResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: workdir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({
          language,
          stdout: stdout.slice(0, 20_000),
          stderr: timedOut ? `${stderr}\nExecution timed out after ${timeoutMs}ms.`.trim() : stderr.slice(0, 20_000),
          exitCode: exitCode ?? (timedOut ? 124 : 1),
          timedOut,
        });
      });
    });

    return result;
  } finally {
    const files = ["script.py", "script.sh", "script.ts", "query.sql", "runner.py"].map((file) => path.join(workdir, file));
    await Promise.all(files.map(async (file) => {
      try {
        await readFile(file);
      } catch {
        return;
      }
    }));
    await rm(workdir, { recursive: true, force: true });
  }
}
