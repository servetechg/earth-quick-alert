import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import ResponderHospitalCapacity from '@/models/ResponderHospitalCapacity';
import ResponderPoliceDeployment from '@/models/ResponderPoliceDeployment';
import ResponderPharmacyDeployment from '@/models/ResponderPharmacyDeployment';
import ResponderTransitDeployment from '@/models/ResponderTransitDeployment';
import ResponderEnergyDeployment from '@/models/ResponderEnergyDeployment';
import ResponderGasDeployment from '@/models/ResponderGasDeployment';
import ResponderElectricDeployment from '@/models/ResponderElectricDeployment';
import ResponderWaterDeployment from '@/models/ResponderWaterDeployment';
import ResponderFoodLogisticsDeployment from '@/models/ResponderFoodLogisticsDeployment';
import ResponderNationalGuardDeployment from '@/models/ResponderNationalGuardDeployment';
import ResponderNonprofitDeployment from '@/models/ResponderNonprofitDeployment';
import ResponderFederalDeployment from '@/models/ResponderFederalDeployment';

/** Remove per-responder operational documents when a user account is deleted. */
export async function deleteResponderOperationalDataForUser(userId: string): Promise<void> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    await Promise.all([
        ResponderHospitalCapacity.deleteMany({ ownerUserId: oid }),
        ResponderPoliceDeployment.deleteMany({ ownerUserId: oid }),
        ResponderPharmacyDeployment.deleteMany({ ownerUserId: oid }),
        ResponderTransitDeployment.deleteMany({ ownerUserId: oid }),
        ResponderEnergyDeployment.deleteMany({ ownerUserId: oid }),
        ResponderGasDeployment.deleteMany({ ownerUserId: oid }),
        ResponderElectricDeployment.deleteMany({ ownerUserId: oid }),
        ResponderWaterDeployment.deleteMany({ ownerUserId: oid }),
        ResponderFoodLogisticsDeployment.deleteMany({ ownerUserId: oid }),
        ResponderNationalGuardDeployment.deleteMany({ ownerUserId: oid }),
        ResponderNonprofitDeployment.deleteMany({ ownerUserId: oid }),
        ResponderFederalDeployment.deleteMany({ ownerUserId: oid }),
    ]);
}
