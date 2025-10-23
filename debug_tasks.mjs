import { StateMachine } from './tools/wvo_mcp/dist/orchestrator/state_machine.js';

const workspaceRoot = process.cwd();
const stateMachine = new StateMachine(workspaceRoot);

console.log('\n=== Checking Task Availability ===\n');

const allTasks = stateMachine.getTasks({ status: ['pending'] });
console.log(`Total pending tasks: ${allTasks.length}`);
allTasks.forEach(t => {
  console.log(`  - ${t.id}: ${t.title} (type=${t.type})`);
});

console.log('\n=== Checking Ready Tasks ===\n');
const readyTasks = stateMachine.getReadyTasks();
console.log(`Ready tasks: ${readyTasks.length}`);
readyTasks.forEach(t => {
  console.log(`  - ${t.id}: ${t.title} (type=${t.type})`);
});

console.log('\n=== Checking isTaskReady for each pending task ===\n');
allTasks.forEach(t => {
  const isReady = stateMachine.isTaskReady(t.id);
  console.log(`  - ${t.id}: ${isReady ? '✓ READY' : '✗ NOT READY'}`);

  if (!isReady) {
    const deps = stateMachine.getDependencies(t.id);
    console.log(`    Dependencies: ${deps.length}`);
    deps.forEach(d => {
      const depTask = stateMachine.getTask(d.depends_on_task_id);
      console.log(`      → ${d.depends_on_task_id} (${depTask?.status || 'NOT FOUND'})`);
    });
  }
});

stateMachine.close();
