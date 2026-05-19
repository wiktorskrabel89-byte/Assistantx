import React from 'react';

export default function ApprovalCard({ action, onApprove, onReject }) {
  if (!action) return null;
  return (
    <div className="approval-card">
      <div><strong>{action.command}</strong></div>
      <p>{action.reason}</p>
      <div className="approval-actions">
        <button type="button" onClick={() => onApprove?.(action.id)}>Approve</button>
        <button type="button" onClick={() => onReject?.(action.id)}>Reject</button>
      </div>
    </div>
  );
}
