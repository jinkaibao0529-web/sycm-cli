// Browser-side commands for the local market workbench. No arbitrary JS or URL input.
async function handleMarket(job) {
  if (!['inspect', 'page'].includes(job.market?.op) || job.launch !== 'https://sycm.taobao.com/robots.txt') {
    return { id: job.id, error: '市场榜单操作无效' };
  }
  const who = await loginNow();
  if (!who.uid) return { id: job.id, error: '请先在 Chrome 登录生意参谋', who };
  try {
    const tabs = await chrome.tabs.query({ url: 'https://sycm.taobao.com/*' });
    const results = [];
    const diagnostics = [];
    for (const tab of tabs) {
      if (tab.url?.endsWith('/robots.txt')) continue;
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, world: 'MAIN', args: [job.market],
        func: async command => {
          const source = window.__sycmMarket;
          const diag = {page:location.origin+location.pathname,observer:!!source,requests:performance.getEntriesByType('resource').map(x=>{try{return new URL(x.name)}catch{return null}}).filter(u=>u&&u.origin===location.origin&&/json|rank|market/.test(u.pathname)).slice(-25).map(u=>u.pathname),observations:source?.observations||[]};
          if (!source) return { profiles: [], diagnostic:diag };
          if (command.op === 'inspect') return { profiles: source.inspect(), diagnostic:diag };
          if (!source.captures.some(c => c.id === command.capture_id)) return null;
          try { return await source.page(command.capture_id, command.page, command.signature); }
          catch (error) { return { error: error.message }; }
        },
      });
      if (job.market.op === 'page' && result?.result) {
        if (result.result.error) throw Error(result.result.error);
        const after = await loginNow();
        return { id: job.id, market: result.result, who, ...(who.uid !== after.uid ? { whoAfter: after } : {}) };
      }
      if (result?.result?.profiles) results.push(...result.result.profiles);
      if (result?.result?.diagnostic) diagnostics.push(result.result.diagnostic);
    }
    if (job.market.op === 'page') throw Error('未找到原市场榜单页面 请保持标签页打开并重新识别');
    const after = await loginNow();
    return {
      id: job.id, who, ...(who.uid !== after.uid ? { whoAfter: after } : {}),
      market: { profiles: results, diagnostics, page_open: tabs.some(t => !t.url?.endsWith('/robots.txt')),
        message: results.length ? '已识别市场商品榜请求 可开始采集' : '取数桥已连接 请刷新市场商品榜并翻页一次 然后重新识别' },
    };
  } catch (error) {
    return { id: job.id, who, error: String(error.message || '市场榜单读取失败') };
  }
}
