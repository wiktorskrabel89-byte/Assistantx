// app/api/workspaces/jarvis-state/route.ts
// Stores and retrieves Jarvis desktop cloud memory (preferences + history).
// This is the endpoint called by local-state.js syncToCloud / loadFromCloud.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';
import { getAuthenticatedUserForSync } from '@/app/lib/sync-auth';
import {
  mergeJarvisIntoWorkspaceState,
  normalizeJarvisCloudPayload,
  projectWorkspaceStateToJarvisCloud,
} from '@/app/lib/jarvis-sync';

function isColumnMissingError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : '';
  const message = typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message.toLowerCase() : '';
  return code === 'PGRST204' || code === '42703' || message.includes('column');
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { user, error: authError } = await getAuthenticatedUserForSync(supabase, req);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let { data, error } = await supabase
    .from('jarvis_cloud_memory')
    .select('preferences, history, tasks, schedules, voice_settings, sync_metadata, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error && isColumnMissingError(error)) {
    const fallback = await supabase
      .from('jarvis_cloud_memory')
      .select('preferences, history, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workspaceState = await supabase
    .from('workspace_states')
    .select('state_json')
    .eq('user_id', user.id)
    .maybeSingle();
  const projected = projectWorkspaceStateToJarvisCloud(workspaceState.data?.state_json ?? null);
  const normalizedCloud = normalizeJarvisCloudPayload({
    preferences: data?.preferences ?? {},
    history: data?.history ?? [],
    tasks: (data as Record<string, unknown> | null)?.tasks ?? [],
    schedules: (data as Record<string, unknown> | null)?.schedules ?? [],
    voiceSettings: (data as Record<string, unknown> | null)?.voice_settings ?? {},
    syncMetadata: (data as Record<string, unknown> | null)?.sync_metadata ?? {},
  });

  const mergedHistory = [...projected.history, ...normalizedCloud.history];
  const dedupedHistory = Array.from(
    new Map(mergedHistory.map((item) => [String((item as Record<string, unknown>).id ?? JSON.stringify(item)), item])).values(),
  ).slice(-50);

  const mergedTasks = Array.from(
    new Map([...projected.tasks, ...normalizedCloud.tasks].map((item) => [String((item as Record<string, unknown>).id ?? JSON.stringify(item)), item])).values(),
  );
  const mergedSchedules = Array.from(
    new Map([...projected.schedules, ...normalizedCloud.schedules].map((item) => [String((item as Record<string, unknown>).id ?? JSON.stringify(item)), item])).values(),
  );

  return NextResponse.json({
    preferences: { ...projected.preferences, ...normalizedCloud.preferences },
    history: dedupedHistory,
    tasks: mergedTasks,
    schedules: mergedSchedules,
    voiceSettings: { ...projected.voiceSettings, ...normalizedCloud.voiceSettings },
    syncOptions: normalizedCloud.syncOptions,
    syncMetadata: normalizedCloud.syncMetadata,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { user, error: authError } = await getAuthenticatedUserForSync(supabase, req);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const normalized = normalizeJarvisCloudPayload(body);

  let { error } = await supabase
    .from('jarvis_cloud_memory')
    .upsert(
      {
        user_id: user.id,
        preferences: normalized.preferences,
        history: normalized.history,
        tasks: normalized.tasks,
        schedules: normalized.schedules,
        voice_settings: normalized.voiceSettings,
        sync_metadata: normalized.syncMetadata,
        schema_version: 1,
        last_source: String(normalized.syncMetadata.sourceDevice ?? 'jarvis-desktop'),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error && isColumnMissingError(error)) {
    const fallback = await supabase
      .from('jarvis_cloud_memory')
      .upsert(
        {
          user_id: user.id,
          preferences: normalized.preferences,
          history: normalized.history,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const workspaceState = await supabase
    .from('workspace_states')
    .select('state_json')
    .eq('user_id', user.id)
    .maybeSingle();
  const mergedState = mergeJarvisIntoWorkspaceState(workspaceState.data?.state_json ?? null, normalized);
  if (mergedState && typeof mergedState === 'object') {
    await supabase
      .from('workspace_states')
      .upsert(
        {
          user_id: user.id,
          state_json: mergedState,
          sync_metadata: {
            source: String(normalized.syncMetadata.sourceDevice ?? 'jarvis-desktop'),
            updatedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
  }

  return NextResponse.json({ ok: true });
}
