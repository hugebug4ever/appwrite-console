import { getLimit, getPage, getView, pageToOffset, View } from '$lib/helpers/load';
import type { PageLoad } from './$types';
import { CARD_LIMIT, Dependencies } from '$lib/constants';
import { sdk } from '$lib/stores/sdk';
import { type Models, Query } from '@appwrite.io/console';

export const load: PageLoad = async ({ params, url, route, depends }) => {
    depends(Dependencies.BACKUPS);
    const page = getPage(url);
    const limit = getLimit(url, route, CARD_LIMIT);
    const view = getView(url, route, View.Grid);
    const offset = pageToOffset(page, limit);

    let backups: Models.BackupArchiveList = { total: 0, archives: [] };
    let policies: Models.BackupPolicyList = { total: 0, policies: [] };

    try {
        [backups, policies] = await Promise.all([
            sdk.forProject.backups.listArchives([
                Query.limit(limit),
                Query.offset(offset),
                Query.orderDesc(''),
                Query.equal('resourceType', 'database'),
                Query.equal('resourceId', params.database)
            ]),

            sdk.forProject.backups.listPolicies([
                Query.orderDesc(''),
                Query.equal('resourceType', 'database'),
                Query.equal('resourceId', params.database)
            ])
        ]);
    } catch (e) {
        // ignore
    }

    const archivesByPolicy = groupArchivesByPolicy(backups.archives);
    const lastBackupDates = Object.fromEntries(getLatestBackupForPolicies(archivesByPolicy));

    return {
        offset,
        limit,
        view,
        backups,
        policies,
        lastBackupDates
    };
};

const groupArchivesByPolicy = (archives: Models.BackupArchive[]) => {
    return archives.reduce((acc, archive) => {
        if (!acc.has(archive.policyId)) {
            acc.set(archive.policyId, []);
        }
        acc.get(archive.policyId)!.push(archive);
        return acc;
    }, new Map<string, Models.BackupArchive[]>());
};

const getLatestBackupForPolicies = (policyIdMap: Map<string, Models.BackupArchive[]>) => {
    const latestBackups = new Map<string, string | null>();
    for (const [policyId, archives] of policyIdMap) {
        const latestBackup = archives.sort(
            (a, b) => new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime()
        )[0];
        if (latestBackup && new Date(latestBackup.$createdAt).getTime() < Date.now()) {
            latestBackups.set(policyId, latestBackup.$createdAt);
        }
    }
    return latestBackups;
};
