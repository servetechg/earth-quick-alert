import { NextResponse } from 'next/server';
import { openaiService } from '@/lib/services/openai-service';
import { getSession } from '@/lib/auth';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';

export async function POST(req: Request) {
  try {
    const { alertType, context } = await req.json();

    if (!alertType) {
      return NextResponse.json({ error: 'Alert type is required' }, { status: 400 });
    }

    const message = await openaiService.generateAlertLanguage(alertType, context);

    try {
      const session = await getSession();
      if (session?.user?.id) {
        void recordActivity({
          userId: session.user.id,
          action: ACTIVITY_ACTIONS.AI_ALERT_MESSAGE,
          label: `AI alert message drafted (${String(alertType)})`,
          meta: { alertType: String(alertType) },
        });
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({ message });
  } catch (error) {
    console.error('AI alert generation failed:', error);
    return NextResponse.json({ error: 'Failed to generate alert message' }, { status: 500 });
  }
}
