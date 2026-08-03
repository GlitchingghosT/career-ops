// tests/providers/myjobmag.test.mjs — official public MyJobMag Nigeria RSS feed.
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — myjobmag');

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/myjobmag.mjs')).href);
  const provider = mod.default;
  const { parseMyJobMagFeed } = mod;

  if (provider.id === 'myjobmag') pass('myjobmag.id is "myjobmag"');
  else fail(`myjobmag.id is ${JSON.stringify(provider.id)}`);

  const hit = provider.detect({ provider: 'myjobmag' });
  if (hit?.url === 'https://www.myjobmag.com/jobsxml.xml') pass('myjobmag.detect() claims explicit provider config');
  else fail(`myjobmag.detect() returned ${JSON.stringify(hit)}`);
  if (provider.detect({ provider: 'remoteok' }) === null) pass('myjobmag.detect() ignores other providers');
  else fail('myjobmag.detect() claimed another provider');

  const sample = `<?xml version="1.0" encoding="iso-8859-1"?>
  <rss version="2.0"><channel>
    <item>
      <title><![CDATA[Front End Developer at Elizabeth Maddeux Limited]]></title>
      <industry><![CDATA[Consulting]]></industry>
      <link><![CDATA[https://www.myjobmag.com/jobs/front-end-developer-at-elizabeth-maddeux-limited]]></link>
      <pubDate>Mon, 3 Aug 2026 12:32:56 GMT</pubDate>
      <description><![CDATA[Do not retain this full third-party description.]]></description>
    </item>
    <item>
      <title>Node.js Engineer &amp; API Developer at Acme Nigeria</title>
      <link>https://www.myjobmag.com/job/node-engineer-at-acme</link>
      <pubDate>invalid</pubDate>
    </item>
    <item><title>Missing link at Drop Ltd</title></item>
    <item><title>Off host at Drop Ltd</title><link>https://example.com/job</link></item>
    <item><title>Credential URL at Drop Ltd</title><link>https://user:pass@www.myjobmag.com/job/x</link></item>
    <item><title>HTTP at Drop Ltd</title><link>http://www.myjobmag.com/job/x</link></item>
    <item><title>Expanded URL at Drop Ltd</title><link>https://www.myjobmag.com/job/${'\u{1F600}'.repeat(450)}</link></item>
    <item><title>Oversized URL at Drop Ltd</title><link>https://www.myjobmag.com/job/${'x'.repeat(3000)}</link></item>
  </channel></rss>`;

  const jobs = parseMyJobMagFeed(sample);
  if (jobs.length === 2) pass('parseMyJobMagFeed keeps canonical HTTPS MyJobMag items only');
  else fail(`parseMyJobMagFeed returned ${jobs.length} jobs`);
  if (jobs[0]?.title === 'Front End Developer' && jobs[0]?.company === 'Elizabeth Maddeux Limited') pass('parseMyJobMagFeed splits role and company at the final " at "');
  else fail(`first role/company mismatch: ${JSON.stringify(jobs[0])}`);
  if (jobs[0]?.location === 'Nigeria' && jobs[0]?.postedAt === Date.parse('Mon, 3 Aug 2026 12:32:56 GMT')) pass('parseMyJobMagFeed maps Nigeria location and publication date');
  else fail(`first location/date mismatch: ${JSON.stringify(jobs[0])}`);
  if (!('description' in jobs[0])) pass('parseMyJobMagFeed does not republish feed descriptions');
  else fail('parseMyJobMagFeed retained third-party description content');
  if (jobs[0]?.note === 'metadata-only: verify requirements, experience, salary, and eligibility on canonical page') pass('parseMyJobMagFeed labels metadata-only records for mandatory human review');
  else fail(`MyJobMag metadata-only note missing: ${JSON.stringify(jobs[0])}`);
  if (jobs[1]?.title === 'Node.js Engineer & API Developer' && jobs[1]?.company === 'Acme Nigeria' && jobs[1]?.postedAt === undefined) pass('parseMyJobMagFeed decodes entities and omits invalid dates');
  else fail(`second item mismatch: ${JSON.stringify(jobs[1])}`);

  const oversized = Array.from({ length: 201 }, (_, i) => `<item><title>Developer ${i} at Acme ${i}</title><link>https://www.myjobmag.com/jobs/job-${i}</link></item>`).join('');
  if (parseMyJobMagFeed(`<rss><channel>${oversized}</channel></rss>`).length === 200) pass('parseMyJobMagFeed caps records at 200');
  else fail('parseMyJobMagFeed did not cap records');

  let captured;
  const fetched = await provider.fetch({ provider: 'myjobmag' }, {
    fetchText: async (url, options) => { captured = { url, options }; return sample; },
  });
  if (fetched.length === 2 && captured?.url === 'https://www.myjobmag.com/jobsxml.xml') pass('myjobmag.fetch() uses the pinned official feed');
  else fail(`myjobmag.fetch() mismatch: ${JSON.stringify(captured)}`);
  if (captured?.options?.redirect === 'error' && captured?.options?.maxBytes === 1000000) pass('myjobmag.fetch() rejects redirects and caps feed bytes');
  else fail(`myjobmag.fetch() options unsafe: ${JSON.stringify(captured?.options)}`);
} catch (error) {
  fail(`myjobmag provider tests crashed: ${error?.stack || error}`);
}
