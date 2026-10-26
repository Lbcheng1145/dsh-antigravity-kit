const PORT = process.env.ANTIGRAVITY_DASHBOARD_PORT || '8765';
const API_BASE = 'http://127.0.0.1:' + PORT;

export const name = 'antigravity-worker';
export const inject = ['tools', 'systemPrompt'];

/** Retry briefly: the dashboard service may still be starting up. */
async function request(path, options) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(API_BASE + path, options);
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Antigravity 本地服务返回了无效响应');
      }
      if (!response.ok) throw new Error(data.error || 'Antigravity 本地服务请求失败');
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(
    'Antigravity 本地服务不可达（' + API_BASE + '）：' + (lastError && lastError.message ? lastError.message : lastError),
  );
}

function sessionWorkspace(exec) {
  const cwd = exec && exec.agent && exec.agent.session && exec.agent.session.header && exec.agent.session.header.cwd;
  return cwd || process.cwd();
}

const RUN_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: {
      ok: { type: 'boolean' },
      text: { type: 'string' },
      conversation_id: { type: 'string' },
      error: { type: 'string' },
    },
  },
  render: (_args, value) => [{
    type: 'text',
    text: value.ok
      ? (value.conversation_id ? 'Conversation: ' + value.conversation_id + '\n\n' : '') + (value.text || '')
      : 'Antigravity error: ' + (value.error || 'unknown error'),
  }],
};

const QUOTA_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: {
      ok: { type: 'boolean' },
      text: { type: 'string' },
      error: { type: 'string' },
    },
  },
  render: (_args, value) => [{
    type: 'text',
    text: value.ok ? (value.text || '') : 'Antigravity quota error: ' + (value.error || 'unknown error'),
  }],
};

export function apply(ctx) {
  ctx.systemPrompt.section({
    name: 'antigravity-worker',
    order: 900,
    text: [
      'When a task requires code or file changes, execute it through Antigravity with the antigravity_run tool instead of only describing the change.',
      'The tool creates a real Antigravity conversation using the existing login and returns the final text and conversation id.',
      'Use one call per independent task and include the workspace path. If you delegate this task to a subagent, tell that subagent to call antigravity_run.',
      'Use antigravity_quota only when the user asks about remaining model quota.',
    ].join(' '),
  });

  ctx.effect(() => ctx.tools.register({
    name: 'antigravity_run',
    description: 'Execute a coding or file task in the running Google Antigravity client. Use this as the worker for implementation and verification tasks; it creates a real Antigravity conversation using the existing login, without a Gemini API key, and returns the final assistant text plus conversation id.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', description: 'Self-contained task for Antigravity. Include the goal, relevant files, constraints, and verification required.' },
        workspace: { type: 'string', description: 'Absolute workspace directory. Defaults to the current session workspace.' },
        model: { type: 'string', enum: ['flash_lite', 'flash', 'pro'], description: 'Antigravity model tier. Defaults to flash; use pro for harder coding work.' },
        timeout_seconds: { type: 'number', description: 'Maximum wait in seconds. Defaults to 300.' },
        conversation_id: { type: 'string', description: 'Continue an existing Antigravity conversation to keep its context. Omit to start a new one.' },
      },
    },
    output: RUN_OUTPUT,
    async execute(args, exec) {
      const workspace = args.workspace || sessionWorkspace(exec);
      const timeout = Number.isFinite(args.timeout_seconds) && args.timeout_seconds > 0 ? args.timeout_seconds : 300;
      try {
        const data = await request('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: args.prompt,
            workspace,
            model: args.model || 'flash',
            timeoutSeconds: timeout,
            conversationId: args.conversation_id || '',
          }),
        });
        return { ok: true, conversation_id: data.conversation_id || '', text: data.text || '' };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }), 'antigravity-worker: run tool');

  ctx.effect(() => ctx.tools.register({
    name: 'antigravity_quota',
    description: 'Query the current Antigravity account model quota. Returns remaining percentages and reset times for Gemini and Claude/GPT model groups.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        workspace: { type: 'string', description: 'Workspace used to locate the running Antigravity project. Defaults to the current session workspace.' },
      },
    },
    output: QUOTA_OUTPUT,
    async execute(args, exec) {
      try {
        const data = await request('/quota?workspace=' + encodeURIComponent(args.workspace || sessionWorkspace(exec)));
        const groups = data.groups || [];
        const lines = [];
        if (data.description) lines.push(data.description, '');
        for (const group of groups) {
          lines.push(group.displayName || '模型组');
          for (const bucket of group.buckets || []) {
            const fraction = typeof bucket.remainingFraction === 'number' ? bucket.remainingFraction : 0;
            lines.push('  - ' + (bucket.displayName || bucket.bucketId || '额度') + ': ' + (fraction * 100).toFixed(1) + '%');
          }
        }
        return { ok: true, text: lines.join('\n') };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }), 'antigravity-worker: quota tool');
}
