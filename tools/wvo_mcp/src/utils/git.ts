import { execa } from "execa";

export async function getCurrentGitSha(cwd: string): Promise<string | null> {
  try {
    const result = await execa("git", ["rev-parse", "HEAD"], { cwd });
    return result.stdout.trim();
  } catch (error) {
    return null;
  }
}
