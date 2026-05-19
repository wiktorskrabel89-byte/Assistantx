import React, { useEffect, useRef } from 'react';

export default function OrbVisualizer({ micRms = 0, ttsRms = 0, state = 'IDLE' }) {
  const orbRef = useRef(null);

  useEffect(() => {
    const node = orbRef.current;
    if (!node) return;

    const energy = state === 'SPEAKING' ? ttsRms : micRms;
    const clamped = Math.max(0, Math.min(1, Number(energy || 0)));
    const scale = 1 + clamped * 0.35;
    node.style.transform = `scale(${scale})`;
    node.style.boxShadow = `0 0 ${Math.round(20 + clamped * 45)}px rgba(56,189,248,${0.25 + clamped * 0.55})`;
  }, [micRms, ttsRms, state]);

  return <div ref={orbRef} className="orb-visualizer" aria-label="orb-visualizer" />;
}
