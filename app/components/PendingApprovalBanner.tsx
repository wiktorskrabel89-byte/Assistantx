"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { usePendingApprovals } from "@/app/hooks/usePendingApprovals";

type PendingApprovalBannerProps = {
  approvalsHook: ReturnType<typeof usePendingApprovals>;
};

export function PendingApprovalBanner({ approvalsHook }: PendingApprovalBannerProps) {
  const task = approvalsHook.tasks[0];
  if (!task) return null;

  const isBusy = approvalsHook.busyTaskId === task.taskId;

  return (
    <Card className="border-amber-500/30 bg-amber-50/90 shadow-sm dark:bg-amber-950/20">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
              Approval required
            </Badge>
            {approvalsHook.tasks.length > 1 ? (
              <span className="text-xs text-muted-foreground">
                {approvalsHook.tasks.length} tasks waiting
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">
            {task.actionType ? `Action: ${task.actionType}` : "A device action needs your approval."}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {task.prompt}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={() => void approvalsHook.reject(task.taskId)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isBusy}
            onClick={() => void approvalsHook.approve(task.taskId)}
          >
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
