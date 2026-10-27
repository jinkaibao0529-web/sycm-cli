// Read-only market request discovery. Runs only on sycm, in the page's MAIN world.
// Request URLs (including anti-CSRF parameters) stay in page memory, never local storage.
(() => {
  if (window.__sycmMarket) return;
  const MAX_CAPTURES = 12;
  const blocked = /(^|[/.])(add|create|update|delete|remove|save|submit|cancel|set|edit|upload|apply|bind|unbind)([/.]|$)/i;
  const sensitive = /token|cookie|session|csrf|secret|password|sign|^_$|^t$/i;
  const pageNames = ['page', 'pageNo', 'pageNum', 'currentPage', 'pageIndex'];
  const unbox = v => v && typeof v === 'object' && !Array.isArray(v) ? (v.value ?? v) : v;
  const itemRow = r => r && typeof r === 'object' &&
    (r.itemId != null || r.productId != null || r.auctionId != null || r.item?.id != null || r.item?.itemId != null) &&
    (r.itemTitle != null || r.itemName != null || r.title != null || r.item?.title != null || r.item?.name != null);

  function findRows(value, path = [], depth = 0) {
    if (depth > 6 || value == null) return null;
    if (Array.isArray(value)) {
      return value.length && value.slice(0, 3).every(itemRow) ? { path, rows: value } : null;
    }
    if (typeof value !== 'object') return null;
    for (const [key, next] of Object.entries(value)) {
      const found = findRows(next, [...path, key], depth + 1);
      if (found) return found;
    }
    return null;
  }

  function totalOf(body, path) {
    let node = body;
    const parents = [node];
    for (const p of path.slice(0, -1)) { node = node?.[p]; parents.unshift(node); }
    for (const parent of parents) {
      if (!parent || typeof parent !== 'object') continue;
      for (const key of ['total', 'totalCount', 'recordCount', 'count']) {
        const n = Number(unbox(parent[key]));
        if (parent[key] != null && Number.isSafeInteger(n) && n >= 0) return n;
      }
    }
    return null;
  }

  function accepted(url) {
    return url.origin === 'https://sycm.taobao.com' &&
      /^\/(mc|market)\//.test(url.pathname) && /(?:rank|ranking)/i.test(url.pathname) &&
      /item|product/i.test(url.pathname) && !blocked.test(url.pathname);
  }

  function signature(url) {
    const u = new URL(url);
    const entries = [...u.searchParams].filter(([k]) => !sensitive.test(k) && !pageNames.includes(k));
    return u.pathname + '?' + new URLSearchParams(entries.sort((a, b) => a[0].localeCompare(b[0])));
  }

  function remember(urlString, body) {
    try {
      const url = new URL(urlString, location.href);
      if (url.origin === location.origin && /^\/(mc|market)\//.test(url.pathname)) {
        const summary = {path:url.pathname,type:typeof body?.data,keys:Object.keys(body||{}).slice(0,12),dataKeys:body?.data&&typeof body.data==='object'?Object.keys(body.data).slice(0,15):[]};
        window.__sycmMarket.observations = [...window.__sycmMarket.observations.filter(x=>x.path!==summary.path),summary].slice(-25);
      }
      if (!accepted(url)) return;
      const found = findRows(body);
      if (!found) return;
      const sig = signature(url);
      const pageKey = pageNames.find(k => url.searchParams.has(k)) || null;
      const old = window.__sycmMarket.captures.find(c => c.signature === sig);
      const capture = {
        id: old?.id || crypto.randomUUID(), signature: sig, url: url.href,
        path: url.pathname, rowsPath: found.path, body, capturedAt: new Date().toISOString(),
        pageKey, sourcePage: location.origin + location.pathname,
        pageBase: old?.pageBase ?? (pageKey === 'pageIndex' && url.searchParams.get(pageKey) === '0' ? 0 : 1),
        params: Object.fromEntries([...url.searchParams].filter(([k]) => !sensitive.test(k) && !pageNames.includes(k))),
      };
      const captures = window.__sycmMarket.captures.filter(c => c.id !== capture.id);
      captures.unshift(capture);
      window.__sycmMarket.captures = captures.slice(0, MAX_CAPTURES);
    } catch (_) { /* Non-JSON/background traffic is not a market dataset. */ }
  }

  const originalFetch = window.fetch;
  const state = window.__sycmMarket = {
    captures: [], observations: [], version: 1,
    inspect() {
      return this.captures.map(c => ({
        id: c.id, signature: c.signature, path: c.path, params: c.params,
        captured_at: c.capturedAt, page_key: c.pageKey, source_page: c.sourcePage,
        sample_count: c.rowsPath.reduce((o, k) => o?.[k], c.body)?.length || 0,
        total: totalOf(c.body, c.rowsPath),
      }));
    },
    async page(id, page, expectedSignature) {
      const c = this.captures.find(c => c.id === id);
      if (!c || c.signature !== expectedSignature) throw Error('页面来源已变化 请重新识别市场榜单');
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw Error('页码无效');
      const url = new URL(c.url);
      if (!accepted(url)) throw Error('只允许已识别的市场商品只读请求');
      if (!c.pageKey && page > 1) throw Error('未识别到分页参数 请在原页面翻页后重新识别');
      if (c.pageKey) {
        // pageIndex is not automatically assumed to be zero-based.
        // The capture must have shown page 1 or 2; infer index only for explicit pageIndex=0.
        url.searchParams.set(c.pageKey, String(c.pageBase === 0 ? page - 1 : page));
      }
      if (url.searchParams.has('_')) url.searchParams.set('_', String(Date.now()));
      const response = await originalFetch.call(window, url.href, { credentials: 'include', signal: AbortSignal.timeout(30000) });
      if (response.status === 401 || response.status === 403 || new URL(response.url).origin !== location.origin || /login/i.test(new URL(response.url).pathname)) {
        throw Error('登录已失效或无权访问 请在生意参谋重新登录并检查权限');
      }
      if (!response.ok) throw Error('市场榜单请求失败 请稍后重试');
      const text = await response.text();
      if (/滑块|验证码|操作过于频繁|请重新登录|异常请求|风控/.test(text)) throw Error('平台要求验证 已停止 请回生意参谋完成验证后重试');
      let body;
      try { body = JSON.parse(text); } catch (_) { throw Error('平台未返回榜单数据 请检查登录或验证提示'); }
      if (body.success === false || (body.code != null && !['0', '200'].includes(String(body.code)))) throw Error('平台拒绝此次查询 请检查权限与验证提示');
      const rows = c.rowsPath.reduce((o, k) => o?.[k], body);
      if (!Array.isArray(rows) || rows.some(r => !itemRow(r))) throw Error('市场榜单结构变化 需要重新适配');
      const total = totalOf(body, c.rowsPath);
      let hasMore = null;
      for (const parent of [body, body.data]) if (typeof parent?.hasMore === 'boolean') hasMore = parent.hasMore;
      return { rows, total, has_more: hasMore, page_key: c.pageKey };
    },
  };
  window.fetch = async function(input, init) {
    const response = await originalFetch.apply(this, arguments);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    if (method.toUpperCase() === 'GET') {
      try {
        const u = new URL(input instanceof Request ? input.url : input, location.href);
        if (u.origin === location.origin && /^\/(mc|market)\//.test(u.pathname)) response.clone().json().then(body => remember(u.href, body)).catch(() => {});
      } catch (_) {}
    }
    return response;
  };
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__marketRead = String(method).toUpperCase() === 'GET' ? String(url) : null;
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    if (this.__marketRead) this.addEventListener('load', () => {
      try {
        if (this.status === 200) remember(this.__marketRead, this.responseType === 'json' ? this.response : JSON.parse(this.responseText));
      } catch (_) {}
    }, { once: true });
    return xhrSend.apply(this, arguments);
  };
})();
