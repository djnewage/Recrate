#!/usr/bin/env node

/**
 * Simple test to verify p-limit behavior with await in loop vs Promise.all
 */

const pLimit = require('p-limit');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
  console.log('Testing p-limit behavior...\n');

  // Test 1: await in for loop (what current code does)
  console.log('Test 1: await in for loop');
  const test1Start = Date.now();
  const limit1 = pLimit(10); // Allow 10 concurrent

  for (let i = 0; i < 20; i++) {
    await limit1(async () => {
      console.log(`  Loop: Task ${i} started at ${Date.now() - test1Start}ms`);
      await sleep(100);
      console.log(`  Loop: Task ${i} finished at ${Date.now() - test1Start}ms`);
    });
  }
  const test1End = Date.now();
  console.log(`Test 1 total time: ${test1End - test1Start}ms\n`);

  // Test 2: Promise.all (what Copilot suggests)
  console.log('Test 2: Promise.all');
  const test2Start = Date.now();
  const limit2 = pLimit(10); // Allow 10 concurrent

  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(
      limit2(async () => {
        console.log(`  Promise.all: Task ${i} started at ${Date.now() - test2Start}ms`);
        await sleep(100);
        console.log(`  Promise.all: Task ${i} finished at ${Date.now() - test2Start}ms`);
      })
    );
  }

  await Promise.all(promises);
  const test2End = Date.now();
  console.log(`Test 2 total time: ${test2End - test2Start}ms\n`);

  console.log('===== RESULTS =====');
  console.log(`Test 1 (await in loop):  ${test1End - test1Start}ms`);
  console.log(`Test 2 (Promise.all):    ${test2End - test2Start}ms`);
  console.log(`Difference: ${((test1End - test1Start) / (test2End - test2Start)).toFixed(1)}x slower`);
  console.log('\nExpected results if concurrent with limit=10:');
  console.log('- 20 tasks, 100ms each, 10 concurrent = ~200ms total');
  console.log('Expected results if sequential:');
  console.log('- 20 tasks, 100ms each = 2000ms total');
}

runTests().catch(console.error);
