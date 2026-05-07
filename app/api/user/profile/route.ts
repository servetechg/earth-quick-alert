import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { cookies } from 'next/headers';
import { decrypt } from '@/lib/auth';
import { getCloudinary } from '@/lib/cloudinary';

type SessionUser = { id: string };

async function getSessionUser(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');

  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const decoded = await decrypt(session.value);
  if (!decoded || !decoded.user || !(decoded.user as SessionUser).id) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) };
  }

  return { ok: true, userId: (decoded.user as SessionUser).id };
}

function jsonUser(doc: InstanceType<typeof User>) {
  return {
    name: doc.name,
    email: doc.email,
    phoneNumber: doc.phoneNumber ?? '',
    profilePic: doc.profilePic ?? '',
    profilePicPublicId: doc.profilePicPublicId ?? '',
    role: doc.role,
    location: doc.location ?? '',
    city: doc.city ?? '',
    country: doc.country ?? '',
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET current profile (session). */
export async function GET() {
  try {
    await dbConnect();
    const auth = await getSessionUser();
    if (!auth.ok) return auth.response;

    const user = await User.findById(auth.userId).select(
      'name email phoneNumber profilePic profilePicPublicId role location city country'
    );
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: jsonUser(user) });
  } catch (error: any) {
    console.error('Profile GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Partial profile update — send only fields you want to change.
 * Allowed: name, email, phone | phoneNumber, location, profilePic, profilePicPublicId
 */
export async function PUT(req: Request) {
  try {
    await dbConnect();
    const auth = await getSessionUser();
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const before = await User.findById(auth.userId).select('profilePicPublicId');

    const updates: Record<string, unknown> = {};

    if ('name' in body) {
      if (typeof body.name !== 'string') {
        return NextResponse.json({ error: 'name must be a string' }, { status: 400 });
      }
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      }
      updates.name = name;
    }

    if ('email' in body) {
      if (typeof body.email !== 'string') {
        return NextResponse.json({ error: 'email must be a string' }, { status: 400 });
      }
      const email = body.email.trim().toLowerCase();
      if (!email) {
        return NextResponse.json({ error: 'email cannot be empty' }, { status: 400 });
      }
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
      }

      const taken = await User.findOne({
        email,
        _id: { $ne: auth.userId },
      }).select('_id');
      if (taken) {
        return NextResponse.json({ error: 'Email is already in use' }, { status: 409 });
      }
      updates.email = email;
    }

    const phoneRaw =
      'phone' in body ? body.phone : 'phoneNumber' in body ? body.phoneNumber : undefined;
    if (phoneRaw !== undefined) {
      if (phoneRaw !== null && typeof phoneRaw !== 'string') {
        return NextResponse.json({ error: 'phone must be a string' }, { status: 400 });
      }
      updates.phoneNumber = typeof phoneRaw === 'string' ? phoneRaw.trim() : '';
    }

    if ('location' in body) {
      if (typeof body.location !== 'string') {
        return NextResponse.json({ error: 'location must be a string' }, { status: 400 });
      }
      updates.location = body.location;
      updates.lastLocationUpdate = new Date();
    }

    if ('profilePic' in body) {
      if (typeof body.profilePic !== 'string') {
        return NextResponse.json({ error: 'profilePic must be a string' }, { status: 400 });
      }
      const pic = body.profilePic.trim();
      updates.profilePic = pic;
      if (!pic) {
        updates.profilePicPublicId = '';
      }
    }

    if ('profilePicPublicId' in body) {
      if (typeof body.profilePicPublicId !== 'string') {
        return NextResponse.json({ error: 'profilePicPublicId must be a string' }, { status: 400 });
      }
      updates.profilePicPublicId = body.profilePicPublicId.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error:
            'Provide at least one of: name, email, phone, phoneNumber, location, profilePic, profilePicPublicId',
        },
        { status: 400 }
      );
    }

    const oldPublicId = before?.profilePicPublicId?.trim() || '';
    const newPublicId =
      typeof updates.profilePicPublicId === 'string' ? updates.profilePicPublicId.trim() : null;
    const shouldDropPic =
      'profilePic' in updates && typeof updates.profilePic === 'string' && updates.profilePic === '';

    if (oldPublicId && (shouldDropPic || (newPublicId !== null && newPublicId !== oldPublicId))) {
      try {
        const cld = getCloudinary();
        await cld.uploader.destroy(oldPublicId, { resource_type: 'image' });
      } catch {
        // Best-effort cleanup; DB still updates to the new asset.
      }
    }

    const updatedUser = await User.findByIdAndUpdate(auth.userId, updates, {
      new: true,
      runValidators: true,
    }).select(
      'name email phoneNumber profilePic profilePicPublicId role location city country'
    );

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: jsonUser(updatedUser),
    });
  } catch (error: any) {
    console.error('Profile PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/** Legacy: full update with required name + email (and optional location). */
export async function POST(req: Request) {
  try {
    await dbConnect();
    const auth = await getSessionUser();
    if (!auth.ok) return auth.response;

    const { name, email, location, profilePic, profilePicPublicId } = await req.json();

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const emailNorm = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(emailNorm)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const taken = await User.findOne({
      email: emailNorm,
      _id: { $ne: auth.userId },
    }).select('_id');
    if (taken) {
      return NextResponse.json({ error: 'Email is already in use' }, { status: 409 });
    }

    const before = await User.findById(auth.userId).select('profilePicPublicId');

    const patch: Record<string, unknown> = {
      name: String(name).trim(),
      email: emailNorm,
      location: typeof location === 'string' ? location : '',
      lastLocationUpdate: new Date(),
    };

    if (profilePic !== undefined) {
      if (typeof profilePic !== 'string') {
        return NextResponse.json({ error: 'profilePic must be a string' }, { status: 400 });
      }
      patch.profilePic = profilePic.trim();
      if (!patch.profilePic) patch.profilePicPublicId = '';
    }
    if (profilePicPublicId !== undefined) {
      if (typeof profilePicPublicId !== 'string') {
        return NextResponse.json({ error: 'profilePicPublicId must be a string' }, { status: 400 });
      }
      patch.profilePicPublicId = profilePicPublicId.trim();
    }

    const oldPublicId = before?.profilePicPublicId?.trim() || '';
    const nextPublicId =
      typeof patch.profilePicPublicId === 'string' ? patch.profilePicPublicId.trim() : null;
    const clearedPic =
      typeof patch.profilePic === 'string' && patch.profilePic === '';

    if (
      oldPublicId &&
      (clearedPic || (nextPublicId !== null && nextPublicId !== oldPublicId))
    ) {
      try {
        const cld = getCloudinary();
        await cld.uploader.destroy(oldPublicId, { resource_type: 'image' });
      } catch {
        // best-effort
      }
    }

    const updatedUser = await User.findByIdAndUpdate(auth.userId, patch, {
      new: true,
      runValidators: true,
    }).select(
      'name email phoneNumber profilePic profilePicPublicId role location city country'
    );

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: jsonUser(updatedUser),
    });
  } catch (error: any) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
