'use strict';

async function runOrchestration({ planner, executor, verifier, retryPolicy, input }) {
  const plan = await planner.createPlan(input);
  const execution = await executor.execute(plan);
  const verification = await verifier.verify(execution);
  if (verification.ok) return { state: 'completed', plan, execution, verification };
  const retried = await retryPolicy.retry({ input, plan, execution, verification });
  return retried || { state: 'failed', plan, execution, verification };
}

module.exports = { runOrchestration };
