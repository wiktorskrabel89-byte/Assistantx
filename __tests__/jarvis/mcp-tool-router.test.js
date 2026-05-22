'use strict';

const { createMCPToolRouter, TOOL_MAP } = require('../../jarvis/desktop/electron/mcp/tool-router');

// Minimal mock server manager
function mockManager(callResult = { content: [{ type: 'text', text: 'ok' }] }) {
  const calls = [];
  return {
    calls,
    listServers: () => [
      { id: 'operating-system', installed: true },
      { id: 'google-suite', installed: true },
    ],
    callTool: async (serverId, method, params) => {
      calls.push({ serverId, method, params });
      return callResult;
    },
  };
}

describe('createMCPToolRouter', () => {
  it('exports a non-empty TOOL_MAP', () => {
    expect(Object.keys(TOOL_MAP).length).toBeGreaterThan(0);
  });

  it('listTools returns all tool names present in TOOL_MAP', () => {
    const manager = mockManager();
    const router = createMCPToolRouter({ serverManager: manager });
    const tools = router.listTools();
    expect(tools.length).toBe(Object.keys(TOOL_MAP).length);
    expect(tools.every((t) => t.name && t.serverId && t.method)).toBe(true);
  });

  it('routes gmail_search to the google-suite server', async () => {
    const manager = mockManager();
    const router = createMCPToolRouter({ serverManager: manager });
    const result = await router.route('gmail_search', { query: 'test' });
    expect(result.ok).toBe(true);
    expect(manager.calls[0].serverId).toBe('google-suite');
    expect(manager.calls[0].method).toBe('search_messages');
    expect(manager.calls[0].params).toEqual({ query: 'test' });
  });

  it('routes calendar_create_event to the google-suite server', async () => {
    const manager = mockManager();
    const router = createMCPToolRouter({ serverManager: manager });
    await router.route('calendar_create_event', { summary: 'Meeting' });
    expect(manager.calls[0].serverId).toBe('google-suite');
    expect(manager.calls[0].method).toBe('create_event');
  });

  it('routes drive_read_file to the google-suite server', async () => {
    const manager = mockManager();
    const router = createMCPToolRouter({ serverManager: manager });
    await router.route('drive_read_file', { fileId: 'abc123' });
    expect(manager.calls[0].serverId).toBe('google-suite');
    expect(manager.calls[0].method).toBe('read_file');
  });

  it('routes github_get_file_contents to the github server', async () => {
    const manager = mockManager();
    const router = createMCPToolRouter({ serverManager: manager });
    await router.route('github_get_file_contents', { owner: 'a', repo: 'b', path: 'README.md' });
    expect(manager.calls[0].serverId).toBe('github');
    expect(manager.calls[0].method).toBe('get_file_contents');
  });

  it('routes memory_search to native memory tools', async () => {
    const manager = mockManager();
    const nativeTools = {
      memory: {
        search_nodes: jest.fn(async () => ({ entities: [] })),
      },
    };
    const router = createMCPToolRouter({ serverManager: manager, nativeTools });
    const result = await router.route('memory_search', { query: 'preferences' });
    expect(result.ok).toBe(true);
    expect(nativeTools.memory.search_nodes).toHaveBeenCalledWith({ query: 'preferences' });
    expect(manager.calls.length).toBe(0);
  });

  it('returns ok:false for an unknown tool name', async () => {
    const manager = mockManager();
    const router = createMCPToolRouter({ serverManager: manager });
    const result = await router.route('totally_unknown_tool', {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown-mcp-tool/);
    expect(manager.calls.length).toBe(0);
  });

  it('returns ok:false when the server manager throws', async () => {
    const manager = {
      callTool: async () => { throw new Error('server-not-running'); },
    };
    const router = createMCPToolRouter({ serverManager: manager });
    const result = await router.route('brave_web_search', { query: 'test' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/server-not-running/);
  });

  it('every server in TOOL_MAP is one of the supported MCP routing server IDs', () => {
    const VALID_IDS = new Set([
      'github', 'filesystem', 'google-suite', 'postgres', 'fetch',
      'brave-search', 'slack', 'memory', 'operating-system',
    ]);
    for (const [toolName, mapping] of Object.entries(TOOL_MAP)) {
      expect(VALID_IDS.has(mapping.serverId)).toBe(true);
    }
  });
});
