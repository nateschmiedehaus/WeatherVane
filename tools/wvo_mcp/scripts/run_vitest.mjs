#!/usr/bin/env node
import { exit } from 'node:process';
import { execa } from 'execa';

const stripUnsupportedFlags = (args) =>
  args.filter((arg) => {
    if (arg === '--runInBand' || arg === '--run-in-band') {
      return false;
    }
    if (arg.startsWith('--runInBand=')) {
      return false;
    }
    if (arg.startsWith('--run-in-band=')) {
      return false;
    }
    return true;
  });

const main = async () => {
  const forwardedArgs = stripUnsupportedFlags(process.argv.slice(2));
  try {
    // Ensure latest TypeScript sources are compiled so tests exercising
    // child-process workers can execute without relying on ts-node loaders.
    await execa('npm', ['run', 'build'], {
      stdio: 'inherit',
      preferLocal: true,
    });

    const subprocess = execa('vitest', ['run', ...forwardedArgs], {
      stdio: 'inherit',
      preferLocal: true,
    });
    const { exitCode } = await subprocess;
    exit(exitCode ?? 0);
  } catch (error) {
    if (error?.exitCode !== undefined) {
      exit(error.exitCode);
    }
    console.error('[run_vitest] Failed to launch Vitest:', error);
    exit(1);
  }
};

await main();
