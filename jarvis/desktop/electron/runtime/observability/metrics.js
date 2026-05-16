'use strict';

function createRuntimeMetrics({ bus } = {}) {
  const counters = new Map();
  const gauges = new Map();

  function increment(name, by = 1, labels = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    counters.set(key, (counters.get(key) || 0) + Number(by || 0));
    bus?.publish('runtime.metric.increment', { name, by, labels });
  }

  function setGauge(name, value, labels = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    gauges.set(key, Number(value || 0));
    bus?.publish('runtime.metric.gauge', { name, value, labels });
  }

  function snapshot() {
    return {
      counters: [...counters.entries()].map(([key, value]) => ({ key, value })),
      gauges: [...gauges.entries()].map(([key, value]) => ({ key, value })),
    };
  }

  return {
    increment,
    setGauge,
    snapshot,
  };
}

module.exports = { createRuntimeMetrics };
