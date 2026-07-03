import {
  API_V1_RUNTIME_CONTRACT_INDEX_METADATA,
  API_V1_RUNTIME_ENDPOINTS,
  CURRENT_RUNTIME_CONTRACT_INDEX_METADATA,
  CURRENT_RUNTIME_ENDPOINTS,
  CURRENT_RUNTIME_NAMESPACES,
  CURRENT_RUNTIME_STATIC_RESOURCES,
  RUNTIME_CONTROL_ENDPOINTS,
  RUNTIME_SCHEMA_CONTRACTS,
} from './runtime-contract-index-abi';

export function getCurrentRuntimeContractIndex() {
  return Object.freeze({
    contractVersion: CURRENT_RUNTIME_CONTRACT_INDEX_METADATA.contractVersion,
    contracts: RUNTIME_SCHEMA_CONTRACTS,
    namespaces: CURRENT_RUNTIME_NAMESPACES,
    runtime: CURRENT_RUNTIME_ENDPOINTS,
    staticResources: CURRENT_RUNTIME_STATIC_RESOURCES,
    control: RUNTIME_CONTROL_ENDPOINTS,
  });
}

export function getApiV1RuntimeContractIndex() {
  return Object.freeze({
    version: API_V1_RUNTIME_CONTRACT_INDEX_METADATA.version,
    contracts: RUNTIME_SCHEMA_CONTRACTS,
    runtime: API_V1_RUNTIME_ENDPOINTS,
    control: RUNTIME_CONTROL_ENDPOINTS,
  });
}
