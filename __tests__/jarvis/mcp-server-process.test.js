'use strict';

const { createMCPServerProcess } = require('../../jarvis/desktop/electron/mcp/server-process');

// Stub child_process.spawn so we don't actually launch processes in tests
jest.mock('child_process', () => {
  const EventEmitter = require('events');

  function makeFakeProc(opts = {}) {
    const proc = new EventEmitter();
    proc.pid = 12345;
    proc.stdin = { write: jest.fn(), end: jest.fn() };
    proc.stdout = new EventEmitter();
    proc.stdout.setEncoding = jest.fn();
    proc.stderr = new EventEmitter();
    proc.stderr.setEncoding = jest.fn();
    proc.kill = jest.fn((_signal) => {
      if (!opts.suppressClose) {
        setImmediate(() => proc.emit('close', 0));
      }
    });
    return proc;
  }

  let currentProc = null;

  return {
    spawn: jest.fn((_cmd, _args, _opts) => {
      currentProc = makeFakeProc();
      return currentProc;
    }),
    __getCurrentProc: () => currentProc,
    __makeFakeProc: makeFakeProc,
  };
});

const { spawn, __getCurrentProc } = require('child_process');

beforeEach(() => {
  spawn.mockClear();
});

describe('createMCPServerProcess', () => {
  it('starts and reports running status', () => {
    const proc = createMCPServerProcess({
      serverId: 'test-server',
      command: 'node',
      args: ['fake.js'],
      env: {},
    });

    const statusEvents = [];
    proc.on('status', (s) => statusEvents.push(s));

    proc.start();

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][0]).toBe('node');

    const status = proc.getStatus();
    expect(status.serverId).toBe('test-server');
    expect(status.running).toBe(true);
    expect(status.pid).toBe(12345);
    expect(statusEvents[0]).toMatchObject({ running: true });
  });

  it('resolves call() when the subprocess emits a valid JSON-RPC response', async () => {
    const proc = createMCPServerProcess({ serverId: 'srv', command: 'fake', args: [], env: {} });
    proc.start();

    const callPromise = proc.call('tools/list', {}, 5000);

    // Simulate stdout response from the subprocess
    const fakeProc = __getCurrentProc();
    fakeProc.stdout.emit(
      'data',
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } }) + '\n',
    );

    const result = await callPromise;
    expect(result).toEqual({ tools: [] });
  });

  it('rejects call() when the subprocess emits a JSON-RPC error', async () => {
    const proc = createMCPServerProcess({ serverId: 'srv', command: 'fake', args: [], env: {} });
    proc.start();

    const callPromise = proc.call('tools/call', {}, 5000);

    const fakeProc = __getCurrentProc();
    fakeProc.stdout.emit(
      'data',
      JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }) + '\n',
    );

    await expect(callPromise).rejects.toThrow('Method not found');
  });

  it('rejects pending call() when the process closes', async () => {
    const proc = createMCPServerProcess({ serverId: 'srv', command: 'fake', args: [], env: {} });
    proc.start();

    const callPromise = proc.call('tools/call', {}, 60_000);

    // Simulate unexpected process exit
    __getCurrentProc().emit('close', 1);

    await expect(callPromise).rejects.toThrow(/closed/);
  });

  it('rejects call() when server is not running', async () => {
    const proc = createMCPServerProcess({ serverId: 'srv', command: 'fake', args: [], env: {} });
    // Do NOT call start()
    await expect(proc.call('tools/list')).rejects.toThrow(/not-running/);
  });

  it('stop() kills the process and prevents restart', () => {
    const proc = createMCPServerProcess({ serverId: 'srv', command: 'fake', args: [], env: {} });
    proc.start();
    const fakeProc = __getCurrentProc();
    proc.stop();
    expect(fakeProc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.getStatus().running).toBe(false);
  });

  it('handles multi-chunk newline-delimited JSON correctly', async () => {
    const proc = createMCPServerProcess({ serverId: 'srv', command: 'fake', args: [], env: {} });
    proc.start();

    const callPromise = proc.call('tools/list', {}, 5000);
    const fakeProc = __getCurrentProc();

    // Emit the response in two chunks split in the middle of the JSON
    const fullLine = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: ['a', 'b'] } }) + '\n';
    const half = Math.floor(fullLine.length / 2);
    fakeProc.stdout.emit('data', fullLine.slice(0, half));
    fakeProc.stdout.emit('data', fullLine.slice(half));

    const result = await callPromise;
    expect(result).toEqual({ tools: ['a', 'b'] });
  });
});
