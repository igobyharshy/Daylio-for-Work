// In-memory stand-in for Supabase Auth + PostgREST, used only for local UI testing
// (the sandbox cannot reach supabase.co). Implements just what the app uses.
import crypto from 'node:crypto';

/** createMock({ fresh: true }) = a brand-new account (sees the welcome journey); default = an account that's past it */
export function createMock({ fresh = false } = {}) {
  const USER = { id: '3284feb9-a6e6-4c59-826e-e9ce61936efb', email: 'ontrack-test@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
  const db = { projects: [], tasks: [], journal_entries: [], user_settings: [], notifications: [], daily_checkins: [], time_blocks: [] };
  if (!fresh) db.user_settings.push({ id: crypto.randomUUID(), user_id: USER.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), display_name: 'Ontrack Test', seeded: false,
    data: { onboarding: { done: true, checklist: 'hidden', seen: { myday: true, timer: true, journal: true, insights: true, projects: true, timeline: true } } } });
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: USER.id, email: USER.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 * 24 }) + '.sig';
  const session = () => ({ access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER });

  const parse = (url) => {
    const u = new URL(url);
    const table = u.pathname.split('/rest/v1/')[1];
    const filters = [], order = [];
    let limit = null;
    for (const [k, v] of u.searchParams) {
      if (k === 'select' || k === 'columns') continue;
      if (k === 'order') { v.split(',').forEach(o => { const [c, dir] = o.split('.'); order.push([c, dir !== 'desc']); }); continue; }
      if (k === 'limit') { limit = Number(v); continue; }
      const i = v.indexOf('.');
      filters.push([k, v.slice(0, i), v.slice(i + 1)]);
    }
    return { table, filters, order, limit };
  };
  const match = (row, filters) => filters.every(([k, op, v]) => {
    const x = row[k];
    if (op === 'eq') return String(x) === v;
    if (op === 'in') return v.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(x));
    if (op === 'is') return v === 'null' ? x == null : String(x) === v;
    return true;
  });
  const defaults = (table, r) => ({
    id: r.id ?? crypto.randomUUID(), user_id: USER.id, created_at: r.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
    ...(table === 'user_settings' ? { display_name: '', data: {}, seeded: false } : {}),
    ...r,
  });

  async function handle(route) {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const json = (status, body, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/auth/v1/')) {
      if (url.includes('/token')) {
        const body = req.postDataJSON?.() ?? {};
        if (body.password && body.password !== 'test-password') return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return json(200, session());
      }
      // sign-up with "confirm email" off: returns a session straight away (the name lands in user_metadata)
      if (url.includes('/signup')) {
        const body = req.postDataJSON?.() ?? {};
        USER.email = body.email ?? USER.email; USER.user_metadata = body.data ?? {};
        return json(200, session());
      }
      if (url.includes('/recover')) return json(200, {});
      if (url.includes('/logout')) return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      if (url.includes('/user')) return json(200, USER);
      return json(200, {});
    }
    if (url.includes('/rest/v1/rpc/')) return json(200, null);
    const { table, filters, order, limit } = parse(url);
    const rows = db[table];
    if (!rows) return json(404, { message: 'no table ' + table });
    const prefer = req.headers()['prefer'] || '';
    const accept = req.headers()['accept'] || '';
    if (method === 'GET' || method === 'HEAD') {
      let out = rows.filter(r => match(r, filters));
      for (const [c, asc] of order.slice().reverse()) out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
      if (limit != null) out = out.slice(0, limit);
      if (accept.includes('vnd.pgrst.object')) {
        if (out.length !== 1) return json(406, { code: 'PGRST116', details: `The result contains ${out.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' });
        return json(200, out[0]);
      }
      return json(200, out);
    }
    const body = req.postDataJSON();
    if (method === 'POST') {
      const list = (Array.isArray(body) ? body : [body]).map(r => defaults(table, r));
      if (prefer.includes('merge-duplicates')) {
        // upsert: replace rows with the same id
        for (const r of list) { const i = rows.findIndex(x => x.id === r.id); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r); }
      } else rows.push(...list);
      if (prefer.includes('return=representation')) return json(201, accept.includes('vnd.pgrst.object') ? list[0] : list);
      return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } });
    }
    if (method === 'PATCH') {
      const hit = rows.filter(r => match(r, filters));
      hit.forEach(r => Object.assign(r, body, { updated_at: new Date().toISOString() }));
      if (prefer.includes('return=representation')) return json(200, hit);
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (method === 'DELETE') {
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], filters)) rows.splice(i, 1);
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    return json(405, {});
  }
  return { db, handle, USER };
}
