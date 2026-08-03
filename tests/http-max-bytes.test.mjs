// tests/http-max-bytes.test.mjs — response limits apply before JSON/text materialization.
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nHTTP transport — response size limits');

try {
  const { fetchJson, fetchText } = await import(pathToFileURL(join(ROOT, 'providers/_http.mjs')).href);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'content-length': '11' } });
    const ok = await fetchJson('https://example.com/jobs', { maxBytes: 32 });
    if (ok?.ok === true) pass('fetchJson parses a response within maxBytes');
    else fail(`bounded JSON parse returned ${JSON.stringify(ok)}`);

    globalThis.fetch = async () => new Response('x'.repeat(64), { headers: { 'content-length': '64' } });
    let lengthRejected = false;
    try { await fetchText('https://example.com/jobs', { maxBytes: 16 }); } catch (error) { lengthRejected = /exceeds 16 bytes/.test(String(error?.message)); }
    if (lengthRejected) pass('fetchText rejects oversized Content-Length before materializing the body');
    else fail('fetchText accepted oversized Content-Length');

    let successCancelCount = 0;
    globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { successCancelCount += 1; } }), {
      headers: { 'content-length': '64' },
    });
    try { await fetchText('https://example.com/jobs', { maxBytes: 16 }); } catch {}
    if (successCancelCount === 1) pass('oversized declared success response is cancelled before rejection');
    else fail(`oversized declared success response cancel count=${successCancelCount}`);

    let errorCancelCount = 0;
    globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { errorCancelCount += 1; } }), {
      status: 500,
      headers: { 'content-length': '64' },
    });
    try { await fetchText('https://example.com/jobs', { maxBytes: 16 }); } catch {}
    if (errorCancelCount === 1) pass('oversized declared error response is cancelled before HTTP error handling');
    else fail(`oversized declared error response cancel count=${errorCancelCount}`);

    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(10)));
        controller.enqueue(new TextEncoder().encode('y'.repeat(10)));
        controller.close();
      },
    }));
    let chunkedRejected = false;
    try { await fetchText('https://example.com/jobs', { maxBytes: 16 }); } catch (error) { chunkedRejected = /exceeds 16 bytes/.test(String(error?.message)); }
    if (chunkedRejected) pass('fetchText stops chunked bodies that exceed maxBytes');
    else fail('fetchText accepted an oversized chunked body');
  } finally {
    globalThis.fetch = originalFetch;
  }
} catch (error) {
  fail(`HTTP maxBytes tests could not run: ${error?.stack || error}`);
}
