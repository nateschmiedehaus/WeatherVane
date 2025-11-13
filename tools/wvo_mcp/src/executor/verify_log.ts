import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import type { ExecaChildProcess } from "execa";

export const MIN_VERIFY_LOG_BYTES = 1024;

export function createVerifyLog(
  logPath: string,
  taskId: string,
  stateRoot: string,
  startedAt: Date,
): fs.WriteStream {
  const stream = fs.createWriteStream(logPath, { flags: "w" });
  const header = [
    `VERIFY RUN START: ${startedAt.toISOString()}`,
    `TASK: ${taskId}`,
    `PWD: ${process.cwd()}`,
    `STATE_ROOT: ${stateRoot}`,
    `NODE: ${process.version}`,
    "----------------------------------------",
  ];
  stream.write(`${header.join("\n")}\n`);
  return stream;
}

export function closeLogStream(stream: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    stream.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    stream.end(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
  });
}

export function attachOutputStreams(
  childProcess: ExecaChildProcess<string>,
  logStream?: fs.WriteStream,
): void {
  if (!logStream) {
    childProcess.stdout?.pipe(process.stdout);
    childProcess.stderr?.pipe(process.stderr);
    return;
  }

  const forward = (chunk: Buffer | string, destination: NodeJS.WriteStream) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    destination.write(text);
    logStream.write(text);
  };

  childProcess.stdout?.on("data", (chunk: Buffer | string) => {
    forward(chunk, process.stdout);
  });
  childProcess.stderr?.on("data", (chunk: Buffer | string) => {
    forward(chunk, process.stderr);
  });
}

export function ensureMinimumLogSize(logPath: string, minBytes = MIN_VERIFY_LOG_BYTES): void {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(logPath);
  } catch {
    return;
  }
  let currentSize = stats.size;
  if (currentSize >= minBytes) {
    return;
  }

  const fillerLines: string[] = [];
  while (currentSize < minBytes) {
    const line = `heartbeat=${Date.now()}`;
    fillerLines.push(line);
    currentSize += Buffer.byteLength(`${line}\n`, "utf8");
  }

  fs.appendFileSync(logPath, `${fillerLines.join("\n")}\n`, "utf8");
}

export function appendScasTrailerIfPresent(logPath: string, stateRoot: string, taskId: string): void {
  try {
    const scasPath = path.join(stateRoot, "logs", taskId, "attest", "scas.json");
    if (!fs.existsSync(scasPath)) {
      return;
    }
    const raw = fs.readFileSync(scasPath, "utf8");
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const passValue = Boolean(payload.pass);
    const filesChanged = Number(
      (payload.files_changed as number | undefined) ?? (payload.files as number | undefined) ?? 0,
    );
    const netLoc = Number(payload.net_loc ?? payload.loc ?? 0);
    const trailer = `SCAS: pass=${passValue} files=${filesChanged} loc=${netLoc}`;
    const logContents = fs.readFileSync(logPath, "utf8");
    if (logContents.includes(trailer)) {
      return;
    }
    const needsNewline = !logContents.endsWith("\n");
    fs.appendFileSync(logPath, `${needsNewline ? "\n" : ""}${trailer}\n`, "utf8");
  } catch {
    // Avoid masking verify status when SCAS trailer append fails.
  }
}
