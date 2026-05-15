'use strict';

async function runCodingAgent({ analyze, plan, modify, verify, retry }) {
  const analysis = await analyze();
  const workPlan = await plan(analysis);
  const result = await modify(workPlan);
  const verification = await verify(result);
  if (verification.ok) return { ok: true, result, verification };
  return retry({ analysis, workPlan, result, verification });
}

module.exports = { runCodingAgent };
