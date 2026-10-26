window.__ModuleLoader__.load({
  id: 'dsh-antigravity-kit',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'antigravity';
    const PANEL_ID = 'antigravity';
    

    const API_PORT = (typeof window !== 'undefined' && window.__ANTIGRAVITY_PORT__) || 8765;
    const API_BASE = 'http://127.0.0.1:' + API_PORT;

    async function request(path, options) {
      const response = await fetch(API_BASE + path, options);
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('本地服务返回了无效响应');
      }
      if (!response.ok) throw new Error(data.error || '本地服务请求失败');
      return data;
    }

    async function withServerRetry(fn) {
      let lastError;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try { return await fn(); }
        catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 500)); }
      }
      throw lastError;
    }

    async function apiQuota(workspace) {
      return withServerRetry(() => request('/quota?workspace=' + encodeURIComponent(workspace)));
    }

    async function apiRun(prompt, workspace, model, timeoutSeconds, conversationId, newSession) {
      return request('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, workspace, model, timeoutSeconds, conversationId: conversationId || '', newSession: newSession === true }),
      });
    }

    const zh = {
      panel: 'Antigravity',
      title: 'Antigravity 控制台',
      subtitle: '在 Antigravity 中执行任务，并查看账户模型额度。',
      refresh: '刷新额度',
      refreshing: '正在刷新...',
      quota: '模型额度',
      quotaHint: '同一模型组共享周额度和 5 小时额度；任务会按 token 成本消耗额度。',
      workspace: '工作区',
      model: '模型',
      prompt: '任务内容',
      promptPlaceholder: '描述要在 Antigravity 中完成的任务，例如：修复 src/utils.py 的 bug 并运行测试...',
      run: '在 Antigravity 运行',
      running: '运行中，请稍候...',
      result: '执行结果',
      resultEmpty: '任务完成后，结果显示在这里。',
      conversation: '对话 ID',
      clear: '清空',
      copy: '复制结果',
      copied: '已复制',
      newSession: '新会话',
      continuing: '继续会话',
      loading: '正在读取额度...',
      noQuota: '暂无额度信息',
      error: '错误',
      resetAt: '重置时间',
      remaining: '剩余',
      modelFlashLite: 'Flash Lite',
      modelFlash: 'Flash',
      modelPro: 'Pro',
      workspaceHint: '必须是绝对路径，例如 C:\\projects\\demo',
      weeklyRemaining: '周额度剩余',
      fiveHourRemaining: '5 小时额度剩余',
      geminiModels: 'Gemini 模型',
      claudeGptModels: 'Claude 与 GPT 模型',
      groupModelsPrefix: '此组包含：',

    };
    const en = {
      panel: 'Antigravity',
      title: 'Antigravity Control',
      subtitle: 'Run tasks in Antigravity and inspect account model quota.',
      refresh: 'Refresh quota',
      refreshing: 'Refreshing...',
      quota: 'Model Quota',
      quotaHint: 'Models in one group share a weekly and a 5-hour limit. Tasks consume quota by token cost.',
      workspace: 'Workspace',
      model: 'Model',
      prompt: 'Task',
      promptPlaceholder: 'Describe a task for Antigravity, for example: fix the bug in src/utils.py and run the tests...',
      run: 'Run in Antigravity',
      running: 'Running, please wait...',
      result: 'Result',
      resultEmpty: 'The result will appear here after the task finishes.',
      conversation: 'Conversation ID',
      clear: 'Clear',
      copy: 'Copy result',
      copied: 'Copied',
      newSession: 'New session',
      continuing: 'Continuing',
      loading: 'Loading quota...',
      noQuota: 'No quota information',
      error: 'Error',
      resetAt: 'Resets',
      remaining: 'Remaining',
      modelFlashLite: 'Flash Lite',
      modelFlash: 'Flash',
      modelPro: 'Pro',
      workspaceHint: 'Must be an absolute path, for example C:\\projects\\demo',
      weeklyRemaining: 'Weekly Limit Remaining',
      fiveHourRemaining: 'Five Hour Limit Remaining',
      geminiModels: 'Gemini Models',
      claudeGptModels: 'Claude and GPT models',
      groupModelsPrefix: 'Models in this group: ',

    };

    const colors = {
      base: 'var(--dsw-alias-bg-base, #ffffff)',
      layer1: 'var(--dsw-alias-bg-layer-1, #ffffff)',
      layer2: 'var(--dsw-alias-bg-layer-2, #f6f7f9)',
      border: 'var(--dsw-alias-border-l2, #e5e7eb)',
      borderStrong: 'var(--dsw-alias-border-l3, #d1d5db)',
      text: 'var(--dsw-alias-label-primary, #111827)',
      muted: 'var(--dsw-alias-label-secondary, #6b7280)',
      faint: 'var(--dsw-alias-label-tertiary, #9ca3af)',
      brand: 'var(--dsw-alias-brand-primary, #2563eb)',
      brandHover: 'var(--dsw-alias-button-primary-hover, #1d4ed8)',
      brandText: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
      hover: 'var(--dsw-alias-interactive-bg-hover, #f3f4f6)',
      error: 'var(--dsw-alias-state-error-primary, #dc2626)',
      success: 'var(--dsw-alias-state-success-primary, #16a34a)',
      warn: 'var(--dsw-alias-state-warn-primary, #d97706)',
    };

    const s = {
      page: {
        minHeight: '100%',
        background: colors.base,
        color: colors.text,
        padding: 'calc(var(--dsh-frame-top-clearance, 48px) + 20px) 24px 32px',
        boxSizing: 'border-box',
        overflow: 'auto',
      },
      inner: { maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 },
      header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
      title: { margin: 0, fontSize: 24, lineHeight: 1.2, fontWeight: 650 },
      subtitle: { margin: '6px 0 0', color: colors.muted, fontSize: 13, lineHeight: 1.5 },
      card: { background: colors.layer1, border: '1px solid ' + colors.border, borderRadius: 12, padding: 16 },
      sectionTitle: { margin: '0 0 8px', fontSize: 15, fontWeight: 650 },
      hint: { margin: '0 0 12px', color: colors.muted, fontSize: 12, lineHeight: 1.55 },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 },
      groupTitle: { margin: '0 0 4px', fontSize: 14, fontWeight: 650 },
      groupDesc: { margin: '0 0 12px', color: colors.muted, fontSize: 12, lineHeight: 1.45 },
      bucket: { marginTop: 10 },
      bucketHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
      bucketName: { fontSize: 12, color: colors.muted },
      bucketValue: { fontSize: 12, fontWeight: 600, color: colors.text },
      track: { height: 8, borderRadius: 999, background: colors.layer2, overflow: 'hidden' },
      fill: { height: '100%', borderRadius: 999, background: colors.brand },
      reset: { marginTop: 4, color: colors.faint, fontSize: 11 },
      field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 },
      label: { fontSize: 12, fontWeight: 600, color: colors.text },
      input: { width: '100%', boxSizing: 'border-box', border: '1px solid ' + colors.borderStrong, borderRadius: 8, background: colors.base, color: colors.text, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
      textarea: { width: '100%', boxSizing: 'border-box', minHeight: 112, resize: 'vertical', border: '1px solid ' + colors.borderStrong, borderRadius: 8, background: colors.base, color: colors.text, padding: '10px', fontSize: 13, lineHeight: 1.55, outline: 'none', fontFamily: 'inherit' },
      row: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' },
      grow: { flex: '1 1 280px', minWidth: 220 },
      button: { border: 'none', borderRadius: 8, background: colors.brand, color: colors.brandText, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
      buttonDisabled: { opacity: 0.55, cursor: 'not-allowed' },
      secondary: { border: '1px solid ' + colors.border, borderRadius: 8, background: colors.layer1, color: colors.text, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
      error: { color: colors.error, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
      meta: { color: colors.faint, fontSize: 11, marginTop: 8, wordBreak: 'break-all' },
      result: { margin: 0, padding: 14, borderRadius: 8, background: colors.layer2, border: '1px solid ' + colors.border, color: colors.text, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 380, overflow: 'auto' },
      empty: { color: colors.faint, fontSize: 12, lineHeight: 1.6, padding: '8px 0' },
      resultHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
    };

    function formatReset(value) {
      if (!value) return '';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }


    function quotaBucketLabel(bucket, t) {
      const id = String(bucket.bucketId || '').toLowerCase();
      const window = String(bucket.window || '').toLowerCase();
      if (id.includes('weekly') || window === 'weekly') return t('weeklyRemaining');
      if (id.includes('5h') || window === '5h') return t('fiveHourRemaining');
      return bucket.displayName || bucket.bucketId || t('quota');
    }

    function quotaGroupLabel(group, t) {
      const name = String(group.displayName || '');
      if (/gemini/i.test(name)) return t('geminiModels');
      if (/claude|gpt/i.test(name)) return t('claudeGptModels');
      return name || t('quota');
    }

    function quotaGroupDescription(group, t) {
      const description = String(group.description || '');
      const match = description.match(/^Models within this group:\s*(.*)$/i);
      return match ? t('groupModelsPrefix') + match[1] : description;
    }

    function QuotaBucket(props) {
      const bucket = props.bucket;
      const fraction = typeof bucket.remainingFraction === 'number' ? bucket.remainingFraction : 0;
      const percent = Math.max(0, Math.min(1, fraction)) * 100;
      const fillColor = percent <= 20 ? colors.error : percent <= 50 ? colors.warn : colors.brand;
      return h('div', { style: s.bucket },
        h('div', { style: s.bucketHead },
          h('span', { style: s.bucketName }, quotaBucketLabel(bucket, props.t)),
          h('span', { style: s.bucketValue }, percent.toFixed(percent >= 99.95 ? 0 : 1) + '%')
        ),
        h('div', { style: s.track }, h('div', { style: { ...s.fill, width: percent + '%', background: fillColor } })),
        bucket.resetTime ? h('div', { style: s.reset }, props.t('resetAt') + ': ' + formatReset(bucket.resetTime)) : null
      );
    }

    function QuotaGroup(props) {
      const group = props.group;
      return h('div', { style: s.card },
        h('h3', { style: s.groupTitle }, quotaGroupLabel(group, props.t)),
        group.description ? h('p', { style: s.groupDesc }, quotaGroupDescription(group, props.t)) : null,
        (group.buckets || []).map((bucket, index) => h(QuotaBucket, {
          key: bucket.bucketId || String(index),
          bucket,
          t: props.t,
        }))
      );
    }

    function PanelIcon() {
      return h('svg', {
        width: 20, height: 20, viewBox: '0 0 24 24', 'aria-hidden': true,
        style: { display: 'block' },
      },
        h('ellipse', { cx: 12, cy: 12, rx: 8.5, ry: 3.8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, transform: 'rotate(-28 12 12)' }),
        h('path', { d: 'M7.2 16.4 12 6.2l4.8 10.2h-2.7l-.9-2.1h-2.6l-.9 2.1H7.2Zm4.8-4.1h.9L12 10.1l-.9 2.2Z', fill: 'currentColor' })
      );
    }

    function AntigravityPage(props) {
      const t = props.t;
      const [workspace, setWorkspace] = React.useState('');
      const [model, setModel] = React.useState('flash');
      const [prompt, setPrompt] = React.useState('');
      const [quota, setQuota] = React.useState(null);
      const [quotaLoading, setQuotaLoading] = React.useState(true);
      const [running, setRunning] = React.useState(false);
      const [result, setResult] = React.useState(null);
      const [conversationId, setConversationId] = React.useState('');
      const [forceNew, setForceNew] = React.useState(false);
      const [error, setError] = React.useState('');
      const [copied, setCopied] = React.useState(false);

      const loadQuota = React.useCallback(async () => {
        setQuotaLoading(true);
        setError('');
        try {
          const data = await apiQuota(workspace);
          setQuota(data);
        } catch (err) {
          setError(err && err.message ? err.message : String(err));
        } finally {
          setQuotaLoading(false);
        }
      }, [workspace]);

      React.useEffect(() => {
        loadQuota();
      }, [loadQuota]);

      const runTask = async () => {
        if (!prompt.trim() || running) return;
        setRunning(true);
        setResult(null);
        setError('');
        try {
          const data = await apiRun(prompt.trim(), workspace, model, 300, forceNew ? '' : conversationId, forceNew);
          setResult(data);
          if (data && data.conversation_id) { setConversationId(data.conversation_id); setForceNew(false); }
        } catch (err) {
          setError(err && err.message ? err.message : String(err));
        } finally {
          setRunning(false);
        }
      };

      const copyResult = async () => {
        if (!result || !result.text) return;
        try {
          await navigator.clipboard.writeText(result.text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      };

      const modelLabel = model === 'flash_lite' ? t('modelFlashLite') : model === 'pro' ? t('modelPro') : t('modelFlash');

      return h('div', { style: s.page },
        h('div', { style: s.inner },
          h('header', { style: s.header },
            h('div', null,
              h('h1', { style: s.title }, t('title')),
              h('p', { style: s.subtitle }, t('subtitle'))
            ),
            h('button', {
              type: 'button',
              style: { ...s.secondary, ...(quotaLoading ? s.buttonDisabled : {}) },
              disabled: quotaLoading,
              onClick: loadQuota,
            }, quotaLoading ? t('refreshing') : t('refresh'))
          ),

          h('section', { style: s.card },
            h('h2', { style: s.sectionTitle }, t('quota')),
            h('p', { style: s.hint }, t('quotaHint')),
            quotaLoading && !quota ? h('div', { style: s.empty }, t('loading')) : null,
            quota && quota.groups && quota.groups.length
              ? h('div', { style: s.grid }, quota.groups.map((group, index) => h(QuotaGroup, {
                  key: group.displayName || String(index),
                  group,
                  t,
                })))
              : (!quotaLoading ? h('div', { style: s.empty }, t('noQuota')) : null)
          ),

          h('section', { style: s.card },
            h('h2', { style: s.sectionTitle }, t('prompt')),
            h('div', { style: s.row },
              h('div', { style: { ...s.field, ...s.grow } },
                h('label', { style: s.label }, t('workspace')),
                h('input', {
                  style: s.input,
                  value: workspace,
                  onChange: (event) => setWorkspace(event.target.value),
                  placeholder: 'C:\\projects\\demo',
                }),
                h('span', { style: { color: colors.faint, fontSize: 11 } }, t('workspaceHint'))
              ),
              h('div', { style: { ...s.field, minWidth: 150 } },
                h('label', { style: s.label }, t('model')),
                h('select', {
                  style: s.input,
                  value: model,
                  onChange: (event) => setModel(event.target.value),
                },
                  h('option', { value: 'flash_lite' }, t('modelFlashLite')),
                  h('option', { value: 'flash' }, t('modelFlash')),
                  h('option', { value: 'pro' }, t('modelPro'))
                )
              ),
            ),
            h('div', { style: s.field },
              h('label', { style: s.label }, t('prompt')),
              h('textarea', {
                style: s.textarea,
                value: prompt,
                onChange: (event) => setPrompt(event.target.value),
                placeholder: t('promptPlaceholder'),
              })
            ),
            h('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
              h('button', {
                type: 'button',
                style: { ...s.button, ...(running || !prompt.trim() ? s.buttonDisabled : {}) },
                disabled: running || !prompt.trim(),
                onClick: runTask,
              }, running ? t('running') : t('run')),
              h('button', {
                type: 'button',
                style: s.secondary,
                onClick: () => { setPrompt(''); setResult(null); setError(''); setConversationId(''); },
                disabled: running,
              }, t('clear')),
              h('button', {
                type: 'button',
                style: s.secondary,
                onClick: () => { setConversationId(''); setForceNew(true); setResult(null); setError(''); },
                disabled: running || !conversationId,
                title: conversationId || '',
              }, t('newSession')),
              running ? h('span', { style: { color: colors.muted, fontSize: 12 } }, t('running')) : null
            ),
            error ? h('div', { style: { ...s.error, marginTop: 12 } }, t('error') + ': ' + error) : null
          ),

          h('section', { style: s.card },
            h('div', { style: s.resultHead },
              h('h2', { style: { ...s.sectionTitle, margin: 0 } }, t('result')),
              result && result.text ? h('button', { type: 'button', style: s.secondary, onClick: copyResult }, copied ? t('copied') : t('copy')) : null
            ),
            result
              ? h('div', null,
                  h('pre', { style: s.result }, result.text || t('resultEmpty')),
                  result.conversation_id ? h('div', { style: s.meta }, t('conversation') + ': ' + result.conversation_id + ' · ' + t('model') + ': ' + modelLabel + ' · ' + t('continuing')) : null
                )
              : h('div', { style: s.empty }, t('resultEmpty'))
          )
        )
      );
    }

    return {
      name: 'antigravity',
      inject: ['slots', 'locale'],
      async apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'antigravity: dictionaries');
        const t = ctx.locale.bind(NS);

        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ t }),
          }, AntigravityPage);
        });

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 1,
          label: () => t('panel'),
          locale: NS,
        }, PanelIcon));
      },
    };
  },
});
