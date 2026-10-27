// Read-only market request discovery. Runs only on sycm, in the page's MAIN world.
// Request URLs (including anti-CSRF parameters) stay in page memory, never local storage.
(() => {
  const previous = window.__sycmMarket;
  if (previous?.version === 4) return;
  const MAX_CAPTURES = 128;
  const blocked = /(^|[/.])(add|create|update|delete|remove|save|submit|cancel|set|edit|upload|apply|bind|unbind)([/.]|$)/i;
  const sensitive = /token|cookie|session|csrf|secret|password|sign|^_$|^t$/i;
  const pageNames = ['page', 'pageNo', 'pageNum', 'currentPage', 'pageIndex'];
  const unbox = v => v && typeof v === 'object' && !Array.isArray(v) ? (v.value ?? v) : v;
  const itemRow = r => r && typeof r === 'object' &&
    (r.itemId != null || r.productId != null || r.auctionId != null || r.item?.id != null || r.item?.itemId != null) &&
    (r.itemTitle != null || r.itemName != null || r.title != null || r.item?.title != null || r.item?.name != null);

  function explainedFailure(payload) {
    const raw=payload?.message||payload?.msg||payload?.errorMessage||payload?.error?.message||'';
    const message=typeof raw==='string'?raw:'';
    if(/请(?:重新)?登录|登录.{0,5}(失效|过期)|未登录/.test(message))return '平台提示登录已失效 请在生意参谋重新登录';
    if(/验证码|滑块|操作过于频繁|异常请求|风控/.test(message))return '平台要求验证 已停止 请在生意参谋处理后重试';
    if(/无权|没有权限|权限不足|无权限|未订购|未开通|未购买|需要订购/.test(message))return '平台明确返回权限不足 请检查当前账号对所选周期的访问权限';
    if(/超出.{0,16}(查询|时间|日期|范围)|超过.{0,16}(保存|保留|查询|期限)|仅支持.{0,20}(天|月|年|历史|日期)|查询期限|保留期|数据已过期|历史.{0,10}(不可|不支持)/.test(message)){
      const window=message.match(/最近\s*(\d+)\s*(天|个月|月|年)/);
      return '平台明确返回所选日期超出可查询范围'+(window?'（平台提示最近'+window[1]+window[2]+'）':'');
    }
    return null;
  }

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
    captures: previous?.captures || [], observations: previous?.observations || [], version: 4,
    inspect() {
      return this.captures.map(c => ({
        id: c.id, signature: c.signature, path: c.path, params: c.params,
        captured_at: c.capturedAt, page_key: c.pageKey, source_page: c.sourcePage,
        rows_path: c.rowsPath, page_base: c.pageBase ?? 1,
        token_names: [...new URL(c.url).searchParams.keys()].filter(k=>['token','_tb_token_'].includes(k)),
        sample_count: c.body ? c.rowsPath.reduce((o, k) => o?.[k], c.body)?.length || 0 : c.sampleCount || 0,
        total: c.body ? totalOf(c.body, c.rowsPath) : c.total ?? null,
      }));
    },
    restore(profiles) {
      for (const p of profiles) {
        try {
          if (this.captures.some(c=>c.id===p.id)) continue;
          if (!Array.isArray(p.rows_path) || p.rows_path.length>6 || !p.rows_path.every(k=>typeof k==='string')) continue;
          const u=new URL(p.path,location.origin);
          if(!accepted(u)) continue;
          for(const [k,v] of Object.entries(p.params||{})) if(!sensitive.test(k))u.searchParams.set(k,String(v));
          if(signature(u.href)!==p.signature)continue;
          if(p.page_key&&pageNames.includes(p.page_key))u.searchParams.set(p.page_key,String(p.page_base===0?0:1));
          for(const k of p.token_names||[])if(['token','_tb_token_'].includes(k))u.searchParams.set(k,'');
          this.captures.push({id:p.id,signature:p.signature,url:u.href,path:p.path,rowsPath:p.rows_path,pageKey:p.page_key,
            pageBase:p.page_base??1,params:p.params,capturedAt:p.captured_at,sourcePage:p.source_page,sampleCount:p.sample_count,total:p.total});
        } catch (_) {}
      }
      this.captures=this.captures.slice(0,MAX_CAPTURES);
    },
    async page(id, page, expectedSignature, dateRange) {
      const c = this.captures.find(c => c.id === id);
      if (!c || c.signature !== expectedSignature) throw Error('页面来源已变化 请重新识别市场榜单');
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw Error('页码无效');
      const url = new URL(c.url);
      if (!accepted(url)) throw Error('只允许已识别的市场商品只读请求');
      if(dateRange!=null){
        if(!/^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/.test(dateRange))throw Error('统计区间无效');
        const [start,end]=dateRange.split('|');
        const days=(Date.parse(end)-Date.parse(start))/86400000;
        const spans={today:0,day:0,recent7:6,recent30:29,week:6};
        const kind=url.searchParams.get('dateType');
        if(!Number.isInteger(days)||days<0||(!(kind in spans)&&kind!=='month')||(kind in spans&&days!==spans[kind]))throw Error('统计区间与时间入口不一致');
        if(kind==='month'&&(start.slice(0,7)!==end.slice(0,7)||!start.endsWith('-01')||new Date(Date.parse(end)+86400000).getUTCDate()!==1))throw Error('月统计必须为完整月份');
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        if(end>today||(kind!=='today'&&end===today))throw Error('统计周期尚未结束');
        if(kind==='today'&&end!==today)throw Error('实时统计日已变化 请重新开始实时采集');
        url.searchParams.set('dateRange',dateRange);
      }
      const csrfCookie=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('_tb_token_='));
      if(csrfCookie){const token=csrfCookie.slice('_tb_token_='.length);for(const k of ['token','_tb_token_'])if(url.searchParams.has(k))url.searchParams.set(k,token);}
      if (!c.pageKey && page > 1) throw Error('未识别到分页参数 请在原页面翻页后重新识别');
      if (c.pageKey) {
        // pageIndex is not automatically assumed to be zero-based.
        // The capture must have shown page 1 or 2; infer index only for explicit pageIndex=0.
        url.searchParams.set(c.pageKey, String(c.pageBase === 0 ? page - 1 : page));
      }
      if (url.searchParams.has('_')) url.searchParams.set('_', String(Date.now()));
      const response = await originalFetch.call(window, url.href, { credentials: 'include', signal: AbortSignal.timeout(30000) });
      if (response.status === 401 || /login/i.test(new URL(response.url).pathname)) throw Error('平台要求重新登录 请在生意参谋完成登录');
      if (new URL(response.url).origin !== location.origin) throw Error('平台重定向了请求 请在生意参谋检查当前页面提示');
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch (_) {
        if(/滑块|验证码|操作过于频繁|异常请求|风控/.test(text))throw Error('平台要求验证 已停止 请在生意参谋处理后重试');
        throw Error(response.status===403?'平台拒绝访问（403） 未提供明确原因 请检查登录或更换日期重试':'平台未返回榜单数据 请在原页面查看提示后重试');
      }
      if (!response.ok || body.success === false || (body.code != null && !['0', '200'].includes(String(body.code)))) throw Error(explainedFailure(body)||'平台拒绝此次查询 未提供明确原因 请更换日期或稍后重试');
      const rows = c.rowsPath.reduce((o, k) => o?.[k], body);
      if (!Array.isArray(rows) || rows.some(r => !itemRow(r))) throw Error(explainedFailure(body)||'市场榜单结构变化 需要重新适配');
      const total = totalOf(body, c.rowsPath);
      if(page===1&&dateRange)remember(url.href,body);
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
