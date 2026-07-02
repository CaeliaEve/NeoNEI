import { getPublishManifestService } from './publish-manifest.service';
import { getPublishReleaseService, type PublishReleaseSummary } from './publish-release.service';

export type PublishAdminReleasesPayload = Readonly<{
  releases: PublishReleaseSummary[];
}>;

export class PublishAdminControlService {
  listReleases(): PublishAdminReleasesPayload {
    return Object.freeze({
      releases: getPublishReleaseService().listReleases(),
    });
  }

  activateRelease(sourceSignature: unknown): unknown {
    const normalized = String(sourceSignature || '').trim();
    const result = getPublishReleaseService().activateRelease(normalized);
    getPublishManifestService().invalidate();
    return result;
  }
}

export function createPublishAdminControlService(): PublishAdminControlService {
  return new PublishAdminControlService();
}
