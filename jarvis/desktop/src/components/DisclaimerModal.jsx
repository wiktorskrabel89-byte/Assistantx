import React from 'react';

export default function DisclaimerModal({ open, onAccept }) {
  if (!open) return null;
  return (
    <div className="disclaimer-modal">
      <h3>Full Control Disclaimer</h3>
      <ul>
        <li>Agent may modify a real Linux system.</li>
        <li>Model mistakes can cause data loss.</li>
        <li>Operations should remain inside local infrastructure.</li>
      </ul>
      <button type="button" onClick={onAccept}>I understand and accept</button>
    </div>
  );
}
