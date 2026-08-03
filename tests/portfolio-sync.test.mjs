// tests/portfolio-sync.test.mjs — deterministic public portfolio evidence import.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nPortfolio evidence synchronizer');

try {
  const { parsePortfolioCatalog, renderArticleDigest } = await import(pathToFileURL(join(ROOT, 'sync-portfolio.mjs')).href);
  const sample = {
    projects: [
      {
        slug: 'weather-app',
        order: 2,
        title: 'Weather App',
        description: 'React weather dashboard with stale-request protection.',
        contribution: 'Built the React interface and Open-Meteo integration.',
        stack: ['React', 'TypeScript', 'Open-Meteo'],
        source: 'https://github.com/example/weather',
        live: 'https://weather.example.com',
        status: 'Live',
      },
      {
        slug: 'task-duty',
        order: 1,
        title: 'TaskDuty',
        description: 'Full-stack task manager.',
        contribution: 'Implemented authentication, ownership, and tests.',
        stack: ['React', 'Node.js', 'MongoDB'],
        source: 'https://github.com/example/task-duty',
        live: null,
        status: 'Deployment-ready',
      },
    ],
  };

  const projects = parsePortfolioCatalog(sample);
  if (projects.length === 2 && projects[0].slug === 'task-duty' && projects[1].slug === 'weather-app') pass('catalog parser returns deterministic project order');
  else fail(`catalog order mismatch: ${JSON.stringify(projects.map(p => p.slug))}`);

  const digest = renderArticleDigest(projects);
  if (digest.includes('## TaskDuty') && digest.indexOf('## TaskDuty') < digest.indexOf('## Weather App')) pass('digest renders projects in catalog order');
  else fail('digest project order is incorrect');
  if (digest.includes('**Verified contribution:** Implemented authentication, ownership, and tests.') && digest.includes('**Source:** https://github.com/example/task-duty')) pass('digest preserves explicit contribution and source evidence');
  else fail('digest omitted explicit evidence');
  if (digest.includes('**Status:** Deployment-ready') && !digest.includes('**Live/preview:** null')) pass('digest preserves status without inventing a live URL');
  else fail('digest mishandled deployment status/live URL');
  if (!/generated impact|increased revenue|expert/i.test(digest)) pass('digest adds no fabricated impact or expertise claims');
  else fail('digest introduced unsupported claims');

  const hostile = parsePortfolioCatalog({ projects: [{
    ...sample.projects[0],
    title: '<img src=x onerror=alert(1)>',
    description: '[click](javascript:alert(1))',
    contribution: '<script>alert(1)</script>',
    stack: ['React', '<svg onload=alert(1)>'],
    status: '[unsafe](javascript:alert(1))',
  }] });
  const hostileDigest = renderArticleDigest(hostile);
  if (!/<(?:img|script|svg)\b/i.test(hostileDigest) && !/(?<!\\)\]\(javascript:/i.test(hostileDigest)) pass('digest escapes imported HTML and Markdown link syntax');
  else fail(`digest preserved executable Markdown/HTML: ${hostileDigest}`);

  const invalidCases = [
    [{ projects: [] }, 'empty catalog'],
    [{ projects: [sample.projects[0], { ...sample.projects[0] }] }, 'duplicate slug/order'],
    [{ projects: [{ ...sample.projects[0], source: 'http://github.com/example/weather' }] }, 'non-HTTPS source'],
    [{ projects: [{ ...sample.projects[0], live: 'javascript:alert(1)' }] }, 'unsafe live URL'],
    [{ projects: [{ ...sample.projects[0], source: 'https://localhost/private' }] }, 'localhost source URL'],
    [{ projects: [{ ...sample.projects[0], source: 'https://localhost./private' }] }, 'trailing-dot localhost source URL'],
    [{ projects: [{ ...sample.projects[0], source: 'https://local/private' }] }, 'single-label local source URL'],
    [{ projects: [{ ...sample.projects[0], source: 'https://internal/private' }] }, 'single-label internal source URL'],
    [{ projects: [{ ...sample.projects[0], source: 'https://intranet/private' }] }, 'single-label intranet source URL'],
    [{ projects: [{ ...sample.projects[0], source: 'https://127.0.0.1/private' }] }, 'loopback source URL'],
    [{ projects: [{ ...sample.projects[0], source: 'https://10.0.0.1/private' }] }, 'private-network source URL'],
    [{ projects: [{ ...sample.projects[0], contribution: '' }] }, 'missing contribution'],
  ];
  for (const [input, label] of invalidCases) {
    let rejected = false;
    try { parsePortfolioCatalog(input); } catch { rejected = true; }
    if (rejected) pass(`catalog parser rejects ${label}`);
    else fail(`catalog parser accepted ${label}`);
  }
} catch (error) {
  fail(`portfolio synchronizer could not be imported/tested: ${error?.stack || error}`);
}
