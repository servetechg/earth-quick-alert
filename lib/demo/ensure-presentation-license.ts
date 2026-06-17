import License from '@/models/License';
import User from '@/models/User';
import { DEMO_PRESENTATION_EMAIL } from '@/lib/demo/constants';
import { invalidateSubAdminJurisdictionCache } from '@/lib/sub-admin/jurisdiction';

/** Ensures arkansas@admin.com has a whole-state Arkansas license (not radius). */
export async function ensureArkansasPresentationLicense(userId: string): Promise<void> {
    const user = (await User.findById(userId).select('email role licenseId state requestedLicenseType').lean()) as {
        email?: string;
        role?: string;
        licenseId?: unknown;
        state?: string;
        requestedLicenseType?: string;
    } | null;

    if (!user || String(user.role) !== 'sub-admin') return;
    if (String(user.email ?? '').trim().toLowerCase() !== DEMO_PRESENTATION_EMAIL) return;

    if (user.licenseId) {
        await License.findByIdAndUpdate(user.licenseId, {
            coverageType: 'state',
            radiusMile: 0,
            billingAddress: 'Little Rock, Arkansas, USA',
        });
        await User.findByIdAndUpdate(userId, {
            state: 'Arkansas',
            requestedLicenseType: 'state',
        });
        invalidateSubAdminJurisdictionCache(userId);
        return;
    }

    const license = await License.create({
        organizationName: 'Arkansas EOC (Presentation)',
        status: 'active',
        coverageType: 'state',
        radiusMile: 0,
        billingAddress: 'Little Rock, Arkansas, USA',
        assignedSubAdminId: userId,
    });

    await User.findByIdAndUpdate(userId, {
        licenseId: license._id,
        state: 'Arkansas',
        requestedLicenseType: 'state',
    });
    invalidateSubAdminJurisdictionCache(userId);
}
