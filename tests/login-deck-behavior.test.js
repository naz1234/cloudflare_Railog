import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/auth/login.js', import.meta.url), 'utf8');
const STORAGE_KEY = 'l3dcLoginChallenge';
const START = Date.parse('2026-10-05T09:00:00Z');

const settle = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

function response(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] || null },
    json: async () => data,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function setup({
  reducedMotion = false,
  returnTo = '/depot?tab=movements#today',
  hash = '',
  challenge = {
    challengeId: 'opaque-tab-local-challenge',
    email: 'operator@flow-metro.com',
    emailHint: 'oper***@flow-metro.com',
    requestRef: 'abc123',
    expiresAt: START + 300000,
    resendAt: START + 60000,
  },
  verifyResponse,
  requestResponse,
  sessionResponse = response({ authenticated: false }, 401),
} = {}) {
  let now = START;
  let timerSequence = 0;
  let focused = null;
  let turnstileCallbacks;
  const timers = new Map();
  const storage = new Map(challenge ? [[STORAGE_KEY, JSON.stringify(challenge)]] : []);
  const requests = [];
  const navigations = [];
  const elements = new Map();

  class Element {
    constructor(id = '') {
      this.id = id;
      this.value = '';
      this.textContent = '';
      this.disabled = false;
      this.hidden = false;
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.classes = new Set();
      this.classAdds = [];
      this.reflows = 0;
      this.classList = {
        add: (...names) => names.forEach((name) => {
          this.classAdds.push(name);
          this.classes.add(name);
        }),
        remove: (...names) => names.forEach((name) => this.classes.delete(name)),
        contains: (name) => this.classes.has(name),
        toggle: (name, force = !this.classes.has(name)) => {
          if (force) this.classes.add(name);
          else this.classes.delete(name);
          return force;
        },
      };
    }

    get offsetWidth() { this.reflows += 1; return 50; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    querySelector() { return this.label; }
    closest(selector) { return selector === '.pin-slot' ? this.slot : null; }
    focus() { if (!this.disabled) focused = this; }
    select() { this.selected = true; }
    addEventListener(name, callback) {
      const listeners = this.listeners.get(name) || [];
      listeners.push(callback);
      this.listeners.set(name, listeners);
    }
    fire(name, extra = {}) {
      const event = { preventDefault() {}, target: this, ...extra };
      return Promise.all((this.listeners.get(name) || []).map((listener) => listener(event)));
    }
  }

  const ids = [
    'login-card', 'form-heading', 'request-stage', 'verify-stage', 'success-stage',
    'success-heading', 'success-name', 'session-duration', 'request-step-indicator',
    'verify-step-indicator', 'success-step-indicator', 'request-form', 'verify-form',
    'request-button', 'verify-button', 'resend-button', 'restart-button', 'expiry-timer',
    'request-reference', 'auth-message', 'login-email', 'turnstile-shell', 'turnstile-status',
    'pin-inputs',
  ];
  ids.forEach((id) => elements.set(id, new Element(id)));
  const get = (id) => elements.get(id);
  for (const id of ['request-button', 'verify-button', 'request-step-indicator', 'verify-step-indicator', 'success-step-indicator']) {
    get(id).label = new Element();
    get(id).label.textContent = id === 'verify-button' ? 'Verify and continue' : 'Send Login Code';
  }
  get('expiry-timer').parentElement = new Element();
  const hints = [new Element(), new Element()];
  const inputs = Array.from({ length: 6 }, (_, index) => {
    const input = new Element(`pin-${index}`);
    input.slot = new Element(`slot-${index}`);
    return input;
  });
  const schedule = (callback, delay, interval = 0) => {
    const id = ++timerSequence;
    timers.set(id, { callback, at: now + delay, interval });
    return id;
  };

  const context = vm.createContext({
    URL,
    Date: class extends Date { static now() { return now; } },
    document: {
      getElementById: get,
      querySelectorAll: (selector) => selector === '#pin-inputs input' ? inputs : hints,
    },
    window: {
      matchMedia: () => ({ matches: reducedMotion }),
      location: {
        href: `https://railog.example/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}${hash}`,
        hash,
        origin: 'https://railog.example',
        replace: (path) => navigations.push(path),
      },
      sessionStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      setTimeout: (callback, delay) => schedule(callback, delay),
      clearTimeout: (id) => timers.delete(id),
      setInterval: (callback, interval) => schedule(callback, interval, interval),
      clearInterval: (id) => timers.delete(id),
      requestAnimationFrame: (callback) => { callback(); return 0; },
      turnstile: {
        render: (selector, callbacks) => {
          turnstileCallbacks = callbacks;
          callbacks.callback('fresh-turnstile-token');
          return 'widget-id';
        },
        reset: () => turnstileCallbacks.callback('refreshed-turnstile-token'),
      },
    },
    fetch: async (path, options) => {
      requests.push({ path, options });
      if (path === '/api/auth/config') return response({ siteKey: 'site-key' });
      if (path === '/api/auth/session') return sessionResponse;
      if (path === '/api/auth/request-code') return requestResponse || response({
        challengeId: 'new-opaque-challenge', requestRef: 'def456',
        emailHint: 'oper***@flow-metro.com', expiresInSeconds: 300, resendAfterSeconds: 60,
      });
      if (path === '/api/auth/verify-code') return verifyResponse || response({
        authenticated: true, user: { name: 'Rail Operator' },
        expiresAt: new Date(START + 36000000).toISOString(),
      });
      throw new Error(`Unexpected request: ${path}`);
    },
  });
  vm.runInContext(source, context, { filename: 'public/auth/login.js' });
  await settle();

  return {
    get, inputs, requests, navigations, storage, timers,
    get focused() { return focused; },
    async paste(value = '123456', index = 0) {
      await inputs[index].fire('paste', { clipboardData: { getData: () => value } });
      await settle();
    },
    async advance(milliseconds) {
      const end = now + milliseconds;
      let next;
      while ((next = [...timers].sort((left, right) => left[1].at - right[1].at)[0]) && next[1].at <= end) {
        const [id, timer] = next;
        now = timer.at;
        if (timer.interval) timer.at += timer.interval;
        else timers.delete(id);
        timer.callback();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

test('typing, paste, replacement, and empty mobile input keep all six PIN cards and button in sync', async () => {
  const app = await setup();
  assert.equal(app.get('login-card').dataset.stage, 'verify');
  assert.equal(app.get('request-step-indicator').classList.contains('is-complete'), true);
  assert.equal(app.get('verify-step-indicator').getAttribute('aria-current'), 'step');
  assert.equal(app.focused, app.inputs[0]);
  await app.paste('12-34 56ignored');
  assert.equal(app.inputs.map((input) => input.value).join(''), '123456');
  assert.equal(app.get('verify-button').disabled, false);
  assert.ok(app.inputs.every((input) => input.slot.classList.contains('is-entering')));

  const input = app.inputs[2];
  const previousReflows = input.slot.reflows;
  input.value = '9';
  await input.fire('input');
  assert.equal(input.value, '9');
  assert.equal(input.slot.reflows, previousReflows + 1);
  assert.equal(app.focused, app.inputs[3]);
  await input.slot.fire('animationend', { target: { tagName: 'svg' } });
  assert.equal(input.slot.classList.contains('is-entering'), true);
  await input.slot.fire('animationend');
  assert.equal(input.slot.classList.contains('is-entering'), false);

  input.value = '';
  await input.fire('input');
  assert.equal(app.get('verify-button').disabled, true);
  assert.equal(input.classList.contains('is-filled'), false);
  assert.equal(input.slot.classList.contains('is-filled'), false);
});

test('verification fans the cards, closes a server-confirmed deck, then shows success before a safe redirect', async () => {
  const pending = deferred();
  const app = await setup({ verifyResponse: pending.promise });
  await app.paste();
  const submission = app.get('verify-form').fire('submit');
  assert.equal(app.get('pin-inputs').classList.contains('is-verifying'), true);
  assert.ok(app.inputs.every((input) => !input.slot.classList.contains('is-entering')));
  assert.equal(app.get('pin-inputs').getAttribute('aria-busy'), 'true');
  assert.ok(app.inputs.every((input) => input.disabled));
  for (const id of ['verify-button', 'resend-button', 'restart-button']) assert.equal(app.get(id).disabled, true);
  await app.get('restart-button').fire('click');
  await app.get('resend-button').fire('click');
  await app.get('verify-form').fire('submit');
  assert.equal(app.get('login-card').dataset.stage, 'verify');
  assert.equal(app.requests.filter(({ path }) => path === '/api/auth/verify-code').length, 1);
  const request = app.requests.find(({ path }) => path === '/api/auth/verify-code');
  assert.deepEqual(JSON.parse(request.options.body), { challengeId: 'opaque-tab-local-challenge', code: '123456' });
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(app.get('success-stage').hidden, true);
  assert.equal(app.get('pin-inputs').classList.contains('is-closing'), false);

  pending.resolve(response({ authenticated: true, user: { name: '  Rail Operator  ' }, expiresAt: new Date(START + 36000000).toISOString() }));
  await settle();
  assert.equal(app.storage.has(STORAGE_KEY), true);
  assert.equal(app.get('request-reference').textContent, 'ABC123');
  assert.equal([...app.timers.values()].some((timer) => timer.interval), false);
  await app.advance(649);
  assert.equal(app.get('login-card').dataset.stage, 'verify');
  assert.equal(app.get('request-reference').textContent, 'ABC123');
  assert.equal(app.get('pin-inputs').classList.contains('is-closing'), false);
  await app.advance(1);
  assert.equal(app.get('pin-inputs').classList.contains('is-verifying'), true);
  assert.equal(app.get('pin-inputs').classList.contains('is-closing'), true);
  assert.equal(app.get('success-stage').hidden, true);
  assert.equal(app.inputs.map((input) => input.value).join(''), '123456');
  await app.advance(749);
  assert.equal(app.get('login-card').dataset.stage, 'verify');
  assert.equal(app.get('request-reference').textContent, 'ABC123');
  assert.equal(app.get('pin-inputs').classList.contains('is-closing'), true);
  assert.equal(app.storage.has(STORAGE_KEY), true);
  assert.ok(app.inputs.every((input) => input.disabled));
  await app.advance(1);
  await submission;
  assert.equal(app.get('login-card').dataset.stage, 'success');
  assert.equal(app.storage.has(STORAGE_KEY), false);
  assert.equal(app.get('success-stage').hidden, false);
  assert.equal(app.get('verify-stage').hidden, true);
  assert.equal(app.get('success-name').textContent, 'Rail Operator');
  assert.equal(app.get('session-duration').textContent, '10 hours');
  assert.equal(app.get('success-step-indicator').getAttribute('aria-current'), 'step');
  assert.equal(app.get('verify-step-indicator').classList.contains('is-complete'), true);
  assert.equal(app.get('pin-inputs').classList.contains('is-verifying'), false);
  assert.equal(app.get('pin-inputs').classList.contains('is-closing'), false);
  assert.equal(app.focused, app.get('success-heading'));
  assert.ok(app.inputs.every((input) => input.disabled));
  await app.advance(1999);
  assert.deepEqual(app.navigations, []);
  await app.advance(1);
  assert.deepEqual(app.navigations, ['/depot?tab=movements#today']);
});

test('failed verification immediately restores the cards and focuses an enabled input without a success screen', async () => {
  const pending = deferred();
  const app = await setup({ verifyResponse: pending.promise });
  await app.paste();
  const submission = app.get('verify-form').fire('submit');
  pending.resolve(response({ authenticated: false }, 401));
  await submission;
  assert.equal(app.get('login-card').dataset.stage, 'verify');
  assert.equal(app.get('success-stage').hidden, true);
  assert.equal(app.get('pin-inputs').classList.contains('is-verifying'), false);
  assert.equal(app.get('pin-inputs').classAdds.includes('is-closing'), false);
  assert.ok(app.inputs.every((input) => !input.disabled && input.value === ''));
  assert.equal(app.get('restart-button').disabled, false);
  assert.equal(app.get('verify-button').disabled, true);
  assert.equal(app.focused, app.inputs[0]);
  assert.match(app.get('auth-message').textContent, /invalid or expired/);
  assert.equal([...app.timers.values()].filter((timer) => !timer.interval).length, 0);
  assert.deepEqual(app.navigations, []);
});

test('network errors restore an editable PIN deck so verification can be retried', async () => {
  const pending = deferred();
  const app = await setup({ verifyResponse: pending.promise });
  await app.paste();
  const submission = app.get('verify-form').fire('submit');
  pending.reject(new Error('Network unavailable'));
  await submission;
  assert.equal(app.get('pin-inputs').getAttribute('aria-busy'), 'false');
  assert.equal(app.get('pin-inputs').classAdds.includes('is-closing'), false);
  assert.equal(app.focused, app.inputs[0]);
  assert.equal(app.get('restart-button').disabled, false);
  assert.equal(app.storage.has(STORAGE_KEY), true);
  await app.paste('654321');
  assert.equal(app.get('verify-button').disabled, false);
});

test('a slow successful response starts closing immediately without repeating the fan delay', async () => {
  const pending = deferred();
  const app = await setup({ verifyResponse: pending.promise });
  await app.paste();
  const submission = app.get('verify-form').fire('submit');
  await app.advance(1500);
  assert.equal(app.get('success-stage').hidden, true);
  assert.equal(app.get('pin-inputs').classList.contains('is-verifying'), true);
  assert.equal(app.get('pin-inputs').classList.contains('is-closing'), false);
  pending.resolve(response({ authenticated: true, user: { name: 'Rail Operator' } }));
  await settle();
  assert.equal(app.get('pin-inputs').classList.contains('is-closing'), true);
  await app.advance(749);
  assert.equal(app.get('success-stage').hidden, true);
  await app.advance(1);
  await submission;
  assert.equal(app.get('login-card').dataset.stage, 'success');
  await app.advance(1999);
  assert.deepEqual(app.navigations, []);
  await app.advance(1);
  assert.equal(app.navigations.length, 1);
});

test('neither truthy authenticated values nor failed HTTP responses unlock the success state', async () => {
  for (const result of [response({ authenticated: 'true' }), response({ authenticated: 1 }), response({ authenticated: true }, 500)]) {
    const app = await setup({ reducedMotion: true, verifyResponse: result });
    await app.paste();
    await app.get('verify-form').fire('submit');
    assert.equal(app.get('login-card').dataset.stage, 'verify');
    assert.equal(app.get('success-stage').hidden, true);
    assert.equal(app.get('pin-inputs').classAdds.includes('is-closing'), false);
    assert.deepEqual(app.navigations, []);
  }
});

test('reduced motion skips card-entry and deck waits but preserves two seconds to read the welcome state', async () => {
  const app = await setup({ reducedMotion: true });
  await app.paste();
  assert.ok(app.inputs.every((input) => !input.slot.classList.contains('is-entering')));
  await app.get('verify-form').fire('submit');
  assert.equal(app.get('login-card').dataset.stage, 'success');
  assert.equal(app.get('pin-inputs').classAdds.includes('is-closing'), false);
  await app.advance(1999);
  assert.deepEqual(app.navigations, []);
  await app.advance(1);
  assert.equal(app.navigations.length, 1);
});

test('unusable display names fall back to the challenged email and markup is assigned only as plain text', async () => {
  for (const name of [null, {}, '', 'x'.repeat(81), 'Bad\u0000Name']) {
    const app = await setup({ reducedMotion: true, verifyResponse: response({ authenticated: true, user: { name } }) });
    await app.paste();
    await app.get('verify-form').fire('submit');
    assert.equal(app.get('success-name').textContent, 'operator');
  }
  const name = '<img src=x onerror=alert(1)>';
  const app = await setup({ reducedMotion: true, verifyResponse: response({ authenticated: true, user: { name } }) });
  await app.paste();
  await app.get('verify-form').fire('submit');
  assert.equal(app.get('success-name').textContent, name);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});

test('successful login does not navigate to an external origin or back into the login route', async () => {
  for (const returnTo of ['https://attacker.example', '//attacker.example', '/\\attacker.example', '/login?returnTo=/depot', 'javascript:alert(1)']) {
    const app = await setup({ reducedMotion: true, returnTo });
    await app.paste();
    await app.get('verify-form').fire('submit');
    await app.advance(2000);
    assert.deepEqual(app.navigations, ['/'], returnTo);
  }
});

test('a phone login retains the removal scan fragment after the server redirect', async () => {
  const hash = '#/removal-scan?id=paired-scan&token=opaque-token';
  const app = await setup({ returnTo: '', hash, sessionResponse: response({ authenticated: true }) });
  assert.deepEqual(app.navigations, [`/${hash}`]);
  const unrelated = await setup({ returnTo: '', hash: '#//attacker.example', sessionResponse: response({ authenticated: true }) });
  assert.deepEqual(unrelated.navigations, ['/']);
});

test('challenge restoration retains expiry and resend cooldown, and restart resets the stage markers', async () => {
  const app = await setup();
  assert.equal(app.get('expiry-timer').textContent, '05:00');
  assert.equal(app.get('resend-button').disabled, true);
  await app.advance(60000);
  assert.equal(app.get('resend-button').disabled, false);
  await app.advance(240000);
  assert.equal(app.storage.has(STORAGE_KEY), false);
  await app.paste();
  await app.get('verify-form').fire('submit');
  assert.equal(app.requests.some(({ path }) => path === '/api/auth/verify-code'), false);
  assert.equal(app.get('verify-button').disabled, true);
  app.get('pin-inputs').classList.add('is-closing', 'is-verifying');
  await app.get('restart-button').fire('click');
  assert.equal(app.get('login-card').dataset.stage, 'request');
  assert.equal(app.get('pin-inputs').classList.contains('is-closing'), false);
  assert.equal(app.get('pin-inputs').classList.contains('is-verifying'), false);
  assert.equal(app.get('request-step-indicator').getAttribute('aria-current'), 'step');
  assert.equal(app.get('request-step-indicator').classList.contains('is-complete'), false);
  assert.equal(app.get('verify-step-indicator').getAttribute('aria-current'), null);
  assert.equal(app.get('success-stage').hidden, true);
  assert.equal(app.get('login-email').value, 'operator@flow-metro.com');
});

test('requesting a code preserves the Turnstile payload and tab-local challenge contract', async () => {
  const app = await setup({ challenge: null });
  assert.equal(app.get('login-card').dataset.stage, 'request');
  app.get('login-email').value = ' Operator@flow-metro.com ';
  await app.get('login-email').fire('input');
  assert.equal(app.get('request-button').disabled, false);
  await app.get('request-form').fire('submit');
  await settle();
  const request = app.requests.find(({ path }) => path === '/api/auth/request-code');
  assert.deepEqual(JSON.parse(request.options.body), { email: 'operator@flow-metro.com', turnstileToken: 'fresh-turnstile-token' });
  assert.equal(app.get('login-card').dataset.stage, 'verify');
  assert.equal(JSON.parse(app.storage.get(STORAGE_KEY)).challengeId, 'new-opaque-challenge');
});

test('rate-limited resend preserves the active challenge and obeys the server cooldown', async () => {
  const app = await setup({ requestResponse: response({}, 429, { 'retry-after': '90' }) });
  await app.advance(60000);
  await app.get('resend-button').fire('click');
  await settle();
  assert.equal(app.get('login-card').dataset.stage, 'verify');
  assert.equal(JSON.parse(app.storage.get(STORAGE_KEY)).challengeId, 'opaque-tab-local-challenge');
  assert.equal(app.get('resend-button').disabled, true);
  assert.equal(app.get('resend-button').textContent, 'Resend in 01:30');
  await app.advance(90000);
  assert.equal(app.get('resend-button').disabled, false);
});
