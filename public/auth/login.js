(() => {
  'use strict';

  const PIN_LENGTH = 6;
  const DEFAULT_EXPIRY_SECONDS = 300;
  const DEFAULT_RESEND_SECONDS = 60;
  const CHALLENGE_STORAGE_KEY = 'l3dcLoginChallenge';
  const FLOW_METRO_EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@flow-metro\.com$/i;
  const GENERIC_REQUEST_ERROR = 'Login is temporarily unavailable. Please try again.';
  const GENERIC_VERIFY_ERROR = 'The code is invalid or expired. Check it and try again.';
  const INVALID_EMAIL_ERROR = 'Enter your approved @flow-metro.com work email.';

  const requestStage = document.getElementById('request-stage');
  const verifyStage = document.getElementById('verify-stage');
  const requestIndicator = document.getElementById('request-step-indicator');
  const verifyIndicator = document.getElementById('verify-step-indicator');
  const requestForm = document.getElementById('request-form');
  const verifyForm = document.getElementById('verify-form');
  const requestButton = document.getElementById('request-button');
  const verifyButton = document.getElementById('verify-button');
  const resendButton = document.getElementById('resend-button');
  const restartButton = document.getElementById('restart-button');
  const expiryTimer = document.getElementById('expiry-timer');
  const requestReference = document.getElementById('request-reference');
  const message = document.getElementById('auth-message');
  const emailInput = document.getElementById('login-email');
  const turnstileShell = document.getElementById('turnstile-shell');
  const turnstileStatus = document.getElementById('turnstile-status');
  const pinInputs = Array.from(document.querySelectorAll('#pin-inputs input'));

  let expiryDeadline = 0;
  let resendDeadline = 0;
  let timerId = 0;
  let isBusy = false;
  let turnstileWidgetId = null;
  let turnstileToken = '';
  let activeChallengeId = '';
  let activeEmail = '';
  let activeEmailHint = '';

  function safeReturnPath() {
    const candidate = new URL(window.location.href).searchParams.get('returnTo');
    if (!candidate || !candidate.startsWith('/')) return '/';
    try {
      const resolved = new URL(candidate, window.location.origin);
      if (resolved.origin !== window.location.origin || resolved.pathname.startsWith('/login')) return '/';
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
      return '/';
    }
  }

  function normalizeFlowEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return FLOW_METRO_EMAIL_PATTERN.test(email) ? email : '';
  }

  function maskFlowEmail(value) {
    const email = normalizeFlowEmail(value);
    if (!email) return 'your***@flow-metro.com';
    const [local] = email.split('@');
    const visibleLength = Math.min(4, Math.max(1, local.length - 1));
    return `${local.slice(0, visibleLength)}***@flow-metro.com`;
  }

  function safeEmailHint(value, email) {
    const hint = String(value || '').trim();
    return hint && hint.length <= 100 ? hint : maskFlowEmail(email);
  }

  function setSelectedEmailHint(value, email = activeEmail) {
    activeEmailHint = safeEmailHint(value, email);
    document.querySelectorAll('[data-selected-email]').forEach((element) => {
      element.textContent = activeEmailHint;
    });
  }

  function saveChallenge(data, email, expiresInSeconds, resendAfterSeconds) {
    const challengeId = String(data.challengeId || '');
    const reference = String(data.requestRef || '').replace(/[^a-z0-9-]/gi, '').slice(0, 16);
    const normalizedEmail = normalizeFlowEmail(email);
    if (!challengeId || !reference || !normalizedEmail) throw new Error('invalid_challenge');
    const emailHint = safeEmailHint(data.emailHint, normalizedEmail);

    const challenge = {
      challengeId,
      email: normalizedEmail,
      emailHint,
      requestRef: reference,
      expiresAt: Date.now() + (Number(expiresInSeconds) || DEFAULT_EXPIRY_SECONDS) * 1000,
      resendAt: Date.now() + (Number(resendAfterSeconds) || DEFAULT_RESEND_SECONDS) * 1000,
    };
    activeChallengeId = challengeId;
    activeEmail = normalizedEmail;
    setSelectedEmailHint(emailHint, normalizedEmail);
    requestReference.textContent = reference.toUpperCase();
    try { window.sessionStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(challenge)); } catch { /* Keep the in-memory copy. */ }
    return challenge;
  }

  function clearChallenge({ clearEmail = false } = {}) {
    activeChallengeId = '';
    requestReference.textContent = '------';
    if (clearEmail) {
      activeEmail = '';
      setSelectedEmailHint('', '');
    }
    try { window.sessionStorage.removeItem(CHALLENGE_STORAGE_KEY); } catch { /* No persistent session token is used. */ }
  }

  function restoreChallenge() {
    try {
      const challenge = JSON.parse(window.sessionStorage.getItem(CHALLENGE_STORAGE_KEY) || 'null');
      const email = normalizeFlowEmail(challenge?.email);
      if (!challenge?.challengeId || !challenge?.requestRef || !email || Number(challenge.expiresAt) <= Date.now()) {
        clearChallenge({ clearEmail: true });
        return false;
      }
      activeChallengeId = String(challenge.challengeId);
      activeEmail = email;
      emailInput.value = email;
      setSelectedEmailHint(challenge.emailHint, email);
      requestReference.textContent = String(challenge.requestRef).toUpperCase();
      showVerifyStage();
      expiryDeadline = Number(challenge.expiresAt);
      resendDeadline = Math.max(Date.now(), Number(challenge.resendAt) || 0);
      window.clearInterval(timerId);
      updateTimers();
      timerId = window.setInterval(updateTimers, 500);
      return true;
    } catch {
      clearChallenge({ clearEmail: true });
      return false;
    }
  }

  function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function retryAfterSeconds(response, data = {}) {
    const bodySeconds = Number(data.retryAfterSeconds ?? data.error?.retryAfterSeconds);
    if (Number.isFinite(bodySeconds) && bodySeconds > 0) return Math.min(3600, Math.ceil(bodySeconds));

    const retryAfter = String(response.headers.get('retry-after') || '').trim();
    const headerSeconds = Number(retryAfter);
    if (Number.isFinite(headerSeconds) && headerSeconds > 0) return Math.min(3600, Math.ceil(headerSeconds));

    const retryDateMs = Date.parse(retryAfter);
    if (Number.isFinite(retryDateMs) && retryDateMs > Date.now()) {
      return Math.min(3600, Math.ceil((retryDateMs - Date.now()) / 1000));
    }
    return DEFAULT_RESEND_SECONDS;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });

    let data = {};
    try { data = await response.json(); } catch { /* A generic message is shown below. */ }
    return { response, data };
  }

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.classList.toggle('is-success', type === 'success');
    message.hidden = !text;
  }

  function setButtonBusy(button, busy, busyLabel) {
    const label = button.querySelector('span');
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = label.textContent;
    label.textContent = busy ? busyLabel : button.dataset.defaultLabel;
    button.classList.toggle('is-loading', busy);
    button.setAttribute('aria-busy', String(busy));
  }

  function setTurnstileStatus(text, state = '') {
    turnstileStatus.textContent = text;
    turnstileShell.classList.toggle('is-ready', state === 'ready');
    turnstileShell.classList.toggle('is-error', state === 'error');
  }

  function updateRequestButton() {
    const requestWaitRemaining = remainingSeconds(resendDeadline);
    const hasValidEmail = Boolean(normalizeFlowEmail(emailInput.value));
    requestButton.disabled = isBusy || !turnstileToken || !hasValidEmail || requestWaitRemaining > 0;
    if (!isBusy) {
      requestButton.querySelector('span').textContent = requestWaitRemaining > 0
        ? `Try again in ${formatTime(requestWaitRemaining)}`
        : (turnstileToken && hasValidEmail ? 'Send Login Code' : 'Complete Email and Security Check');
    }
  }

  function clearTurnstileToken(status = 'Preparing a fresh security check…') {
    turnstileToken = '';
    setTurnstileStatus(status);
    updateRequestButton();
  }

  function resetTurnstile() {
    clearTurnstileToken();
    if (turnstileWidgetId !== null && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function waitForTurnstile(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        if (window.turnstile?.render) resolve(window.turnstile);
        else if (Date.now() - startedAt >= timeoutMs) reject(new Error('turnstile_unavailable'));
        else window.setTimeout(check, 80);
      };
      check();
    });
  }

  async function initializeTurnstile() {
    try {
      const [{ response, data }, turnstile] = await Promise.all([
        api('/api/auth/config'),
        waitForTurnstile(),
      ]);
      if (!response.ok || !data.siteKey) throw new Error('auth_config_unavailable');
      turnstileWidgetId = turnstile.render('#turnstile-widget', {
        sitekey: data.siteKey,
        theme: 'dark',
        appearance: 'interaction-only',
        size: 'flexible',
        action: 'l3dc-login',
        callback(token) {
          turnstileToken = token;
          setTurnstileStatus('Security check ready.', 'ready');
          updateRequestButton();
        },
        'expired-callback'() {
          clearTurnstileToken('Security check expired. Preparing a new check…');
          resetTurnstile();
        },
        'timeout-callback'() {
          clearTurnstileToken('Security check timed out. Preparing a new check…');
          resetTurnstile();
        },
        'error-callback'() {
          clearTurnstileToken('Security check unavailable. Refresh this page to retry.');
          setTurnstileStatus('Security check unavailable. Refresh this page to retry.', 'error');
        },
      });
    } catch {
      clearTurnstileToken('Secure login could not be prepared. Refresh this page to retry.');
      setTurnstileStatus('Secure login could not be prepared. Refresh this page to retry.', 'error');
      showMessage(GENERIC_REQUEST_ERROR);
    }
  }

  function readPin() {
    return pinInputs.map((input) => input.value).join('');
  }

  function clearPin() {
    pinInputs.forEach((input) => {
      input.value = '';
      input.classList.remove('is-filled');
    });
    updateVerifyButton();
  }

  function updateVerifyButton() {
    verifyButton.disabled = isBusy || readPin().length !== PIN_LENGTH || Date.now() >= expiryDeadline;
  }

  function remainingSeconds(deadline) {
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  }

  function updateTimers() {
    const expiryRemaining = remainingSeconds(expiryDeadline);
    const resendRemaining = remainingSeconds(resendDeadline);
    expiryTimer.textContent = formatTime(expiryRemaining);
    expiryTimer.parentElement.classList.toggle('is-expired', expiryRemaining === 0);
    resendButton.disabled = isBusy || resendRemaining > 0 || !turnstileToken;
    resendButton.textContent = resendRemaining > 0
      ? `Resend in ${formatTime(resendRemaining)}`
      : (turnstileToken ? 'Resend code' : 'Preparing secure resend…');
    updateRequestButton();
    updateVerifyButton();

    if (expiryRemaining === 0 && verifyStage.hidden === false && activeChallengeId) {
      clearChallenge();
      showMessage('This code has expired. Request a new code to continue.');
    }
  }

  function startTimers(expiresInSeconds, resendAfterSeconds) {
    expiryDeadline = Date.now() + (Number(expiresInSeconds) || DEFAULT_EXPIRY_SECONDS) * 1000;
    resendDeadline = Date.now() + (Number(resendAfterSeconds) || DEFAULT_RESEND_SECONDS) * 1000;
    window.clearInterval(timerId);
    updateTimers();
    timerId = window.setInterval(updateTimers, 500);
  }

  function showVerifyStage() {
    requestStage.hidden = true;
    verifyStage.hidden = false;
    requestIndicator.classList.remove('is-current');
    requestIndicator.classList.add('is-complete');
    requestIndicator.removeAttribute('aria-current');
    requestIndicator.querySelector(':scope > span').textContent = '✓';
    verifyIndicator.classList.add('is-current');
    verifyIndicator.setAttribute('aria-current', 'step');
    clearPin();
    window.requestAnimationFrame(() => pinInputs[0].focus());
  }

  function showRequestStage() {
    const previousEmail = activeEmail || normalizeFlowEmail(emailInput.value);
    verifyStage.hidden = true;
    requestStage.hidden = false;
    verifyIndicator.classList.remove('is-current');
    verifyIndicator.removeAttribute('aria-current');
    requestIndicator.classList.remove('is-complete');
    requestIndicator.classList.add('is-current');
    requestIndicator.setAttribute('aria-current', 'step');
    requestIndicator.querySelector(':scope > span').textContent = '01';
    window.clearInterval(timerId);
    expiryDeadline = 0;
    resendDeadline = 0;
    clearChallenge({ clearEmail: true });
    if (previousEmail) emailInput.value = previousEmail;
    clearPin();
    showMessage('');
    resetTurnstile();
    emailInput.focus();
  }

  async function requestCode({ isResend = false } = {}) {
    if (isBusy || !turnstileToken) return;
    const email = isResend ? activeEmail : normalizeFlowEmail(emailInput.value);
    if (!email) {
      emailInput.setAttribute('aria-invalid', 'true');
      showMessage(INVALID_EMAIL_ERROR);
      if (!isResend) emailInput.focus();
      updateRequestButton();
      return;
    }
    activeEmail = email;
    const requestTurnstileToken = turnstileToken;
    isBusy = true;
    clearTurnstileToken('Security check submitted. Preparing a fresh check…');
    showMessage('');
    const activeButton = isResend ? resendButton : requestButton;
    if (!isResend) setButtonBusy(requestButton, true, 'Sending secure code');
    resendButton.disabled = true;

    try {
      const { response, data } = await api('/api/auth/request-code', {
        method: 'POST',
        body: JSON.stringify({ email, turnstileToken: requestTurnstileToken }),
      });
      if (response.status === 429) {
        resendDeadline = Math.max(resendDeadline, Date.now() + retryAfterSeconds(response, data) * 1000);
        window.clearInterval(timerId);
        updateTimers();
        timerId = window.setInterval(updateTimers, 500);
        showMessage('Please wait before requesting another code.');
        return;
      }
      if (!response.ok) throw new Error('request_failed');

      const challenge = saveChallenge(data, email, data.expiresInSeconds, data.resendAfterSeconds);

      if (!isResend) showVerifyStage();
      else {
        clearPin();
        pinInputs[0].focus();
      }
      startTimers(
        Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000)),
        Math.max(1, Math.ceil((challenge.resendAt - Date.now()) / 1000)),
      );
      showMessage(isResend ? `A new code was requested for ${challenge.emailHint}.` : '', 'success');
    } catch {
      showMessage(GENERIC_REQUEST_ERROR);
    } finally {
      isBusy = false;
      if (!isResend) setButtonBusy(requestButton, false, 'Sending secure code');
      activeButton.removeAttribute('aria-busy');
      resetTurnstile();
      updateRequestButton();
      updateTimers();
    }
  }

  function distributeDigits(startIndex, rawValue) {
    const digits = String(rawValue || '').replace(/\D/g, '').slice(0, PIN_LENGTH - startIndex);
    if (!digits) return;

    digits.split('').forEach((digit, offset) => {
      const input = pinInputs[startIndex + offset];
      if (!input) return;
      input.value = digit;
      input.classList.add('is-filled');
    });

    const nextIndex = Math.min(startIndex + digits.length, PIN_LENGTH - 1);
    pinInputs[nextIndex].focus();
    pinInputs[nextIndex].select();
    showMessage('');
    updateVerifyButton();
  }

  pinInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '');
      input.value = '';
      input.classList.remove('is-filled');
      distributeDigits(index, digits);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace') {
        if (input.value) {
          input.value = '';
          input.classList.remove('is-filled');
        } else if (index > 0) {
          pinInputs[index - 1].value = '';
          pinInputs[index - 1].classList.remove('is-filled');
          pinInputs[index - 1].focus();
        }
        event.preventDefault();
        updateVerifyButton();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        pinInputs[index - 1].focus();
      } else if (event.key === 'ArrowRight' && index < PIN_LENGTH - 1) {
        event.preventDefault();
        pinInputs[index + 1].focus();
      }
    });

    input.addEventListener('paste', (event) => {
      event.preventDefault();
      distributeDigits(index, event.clipboardData?.getData('text') || '');
    });
  });

  emailInput.addEventListener('input', () => {
    emailInput.removeAttribute('aria-invalid');
    if (message.textContent === INVALID_EMAIL_ERROR) showMessage('');
    updateRequestButton();
  });

  emailInput.addEventListener('blur', () => {
    if (emailInput.value && !normalizeFlowEmail(emailInput.value)) {
      emailInput.setAttribute('aria-invalid', 'true');
    }
  });

  requestForm.addEventListener('submit', (event) => {
    event.preventDefault();
    requestCode();
  });

  resendButton.addEventListener('click', () => requestCode({ isResend: true }));
  restartButton.addEventListener('click', showRequestStage);

  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = readPin();
    if (isBusy || !activeChallengeId || code.length !== PIN_LENGTH || Date.now() >= expiryDeadline) return;

    isBusy = true;
    showMessage('');
    setButtonBusy(verifyButton, true, 'Verifying code');
    pinInputs.forEach((input) => { input.disabled = true; });

    try {
      const { response, data } = await api('/api/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ challengeId: activeChallengeId, code }),
      });
      if (!response.ok || data.authenticated !== true) throw new Error('invalid_code');
      clearChallenge({ clearEmail: true });
      showMessage('Access confirmed. Opening the West Depot workspace…', 'success');
      window.setTimeout(() => window.location.replace(safeReturnPath()), 350);
    } catch {
      clearPin();
      showMessage(GENERIC_VERIFY_ERROR);
      pinInputs[0].focus();
    } finally {
      isBusy = false;
      setButtonBusy(verifyButton, false, 'Verifying code');
      pinInputs.forEach((input) => { input.disabled = false; });
      updateVerifyButton();
    }
  });

  restoreChallenge();
  initializeTurnstile();

  api('/api/auth/session')
    .then(({ response, data }) => {
      if (response.ok && data.authenticated === true) window.location.replace(safeReturnPath());
    })
    .catch(() => { /* The request-code action will display a generic error if needed. */ });
})();
