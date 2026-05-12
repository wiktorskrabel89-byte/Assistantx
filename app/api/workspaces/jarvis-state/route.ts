// app/api/workspaces/jarvis-state/route.ts
// Stores and retrieves Jarvis desktop cloud memory (preferences + history).
// This is the endpoint called by local-state.js syncToCloud / loadFromCloud.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('jarvis_cloud_memory')
    .select('preferences, history, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    preferences: data?.preferences ?? {},
    history: data?.history ?? [],
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { preferences, history } = body as { preferences?: unknown; history?: unknown };

  const { error } = await supabase
    .from('jarvis_cloud_memory')
    .upsert(
      {
        user_id: user.id,
        preferences: preferences ?? {},
        history: Array.isArray(history) ? history.slice(0, 50) : [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
