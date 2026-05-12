// app/api/jarvis/linked-accounts/route.ts
// List and delete linked third-party accounts for the authenticated user.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('jarvis_linked_accounts')
    .select('id, provider, label, scope, expires_at, metadata, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { provider } = await req.json().catch(() => ({})) as { provider?: string };
  if (!provider) {
    return NextResponse.json({ error: 'Missing provider' }, { status: 400 });
  }

  const { error } = await supabase
    .from('jarvis_linked_accounts')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
