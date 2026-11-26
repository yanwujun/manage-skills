import { createInterface } from 'node:readline/promises';

/** 交互式确认；非 TTY 时返回 false（调用方应提示改用 --yes）。 */
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes' || answer === '是';
  } finally {
    rl.close();
  }
}