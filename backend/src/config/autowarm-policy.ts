import {
  resolveAutowarmPolicyFromEnv,
  type AutowarmPolicy,
  type Env,
} from './autowarm-policy-abi';

export type { AutowarmPolicy, Env };

export function getAutowarmPolicy(env: Env = process.env): AutowarmPolicy {
  return resolveAutowarmPolicyFromEnv(env);
}
