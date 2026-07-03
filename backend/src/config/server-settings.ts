import { createAdminAccessGuard } from '../utils/admin-access';
import {
  isEnvDisabled,
  isEnvEnabled,
  resolveAdminAccessGuardOptions,
  resolveBooleanSetting,
  resolveNumberSetting,
  resolvePublicBaseUrl,
  resolvePublicRuntimeOnly,
  resolveStringSetting,
} from './server-settings-abi';

export { isEnvDisabled, isEnvEnabled, resolvePublicRuntimeOnly };

const host = resolveStringSetting('host');
const port = resolveNumberSetting('port');

export const serverSettings = {
  port,
  host,
  publicBaseUrl: resolvePublicBaseUrl({ host, port }),
  publishMaterializeOnStart: resolveBooleanSetting('publishMaterializeOnStart') ?? false,
  publicRuntimeOnly: resolvePublicRuntimeOnly(),
} as const;

export const requireAdminToken = createAdminAccessGuard(resolveAdminAccessGuardOptions());
