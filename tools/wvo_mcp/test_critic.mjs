import { ModelingRealityV2Critic } from './dist/critics/modeling_reality_v2.js';

const critic = new ModelingRealityV2Critic(process.cwd());
const result = await critic.evaluate('T12.3.2', ['state/evidence/test_validation_report.json']);

console.log(JSON.stringify(result, null, 2));
