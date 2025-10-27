#!/usr/bin/env node
/**
 * Dummy process for testing
 * Stays alive for 30 seconds unless killed
 */

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log(`Dummy process started (PID ${process.pid})`);

  // Stay alive for 30 seconds
  await sleep(30000);

  console.log('Dummy process exiting');
}

main().catch(err => {
  console.error('Dummy process error:', err);
  process.exit(1);
});
