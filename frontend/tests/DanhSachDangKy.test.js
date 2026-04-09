const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.classes = new Set();
  }

  _sync() {
    this.owner.className = Array.from(this.classes).join(' ').trim();
  }

  add(...names) {
    names.filter(Boolean).forEach((name) => this.classes.add(name));
    this._sync();
  }

  remove(...names) {
    names.filter(Boolean).forEach((name) => this.classes.delete(name));
    this._sync();
  }

  toggle(name, force) {
    if (!name) return false;
    const shouldAdd = typeof force === 'boolean' ? force : !this.classes.has(name);
    if (shouldAdd) {
      this.classes.add(name);
    } else {
      this.classes.delete(name);
    }
    this._sync();
    return shouldAdd;
  }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.innerHTML = '';
    this.textContent = '';
    this.className = '';
    this.value = '';
    this.href = '';
    this.dataset = {};
    this.disabled = false;
    this.listeners = new Map();
    this.children = [];
    this.classList = new FakeClassList(this);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
  }

  focus() {}
  setAttribute() {}
  closest() { return null; }
}

function createResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('nút gửi lại email trên bảng đăng ký gọi đúng API resend', async () => {
  const scriptPath = path.resolve(__dirname, '../js/DanhSachDangKy.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  const elements = new Map();
  const ids = [
    'event-selector',
    'selected-event-info',
    'registration-table-body',
    'page-message',
    'registration-status',
    'empty-state',
    'table-wrapper',
    'hero-event-title',
    'hero-registration-count',
    'hero-registration-status',
    'registration-form-link',
    'manual-checkin-form',
    'manual-checkin-keyword',
    'manual-checkin-message',
    'manual-checkin-result',
    'toast-container',
    'search-input',
    'checkin-filter'
  ];

  for (const id of ids) {
    elements.set(id, new FakeElement(id));
  }

  const fetchCalls = [];
  let registrationState = {
    id: 1,
    event_id: 1,
    full_name: 'Nguyen Van A',
    student_id: 'SV001',
    email: 'sv001@example.com',
    phone: '0900000001',
    registration_code: 'DK-0001',
    email_delivery_status: 'Chờ gửi',
    email_sent_at: null,
    email_error_message: null,
    checked_in_at: null,
    is_checked_in: false,
    created_at: '2026-04-01 09:00:00'
  };

  const fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });

    if (String(url).endsWith('/api/events')) {
      return createResponse(200, [
        {
          id: 1,
          title: 'Hoi thao Agile',
          event_time: '2026-04-05 18:00:00',
          location: 'Hoi truong A',
          description: 'Demo',
          registration_count: 1
        }
      ]);
    }

    if (String(url).includes('/api/events/1/registrations')) {
      return createResponse(200, {
        event: {
          id: 1,
          title: 'Hoi thao Agile',
          event_time: '2026-04-05 18:00:00',
          location: 'Hoi truong A',
          description: 'Demo',
          registration_count: 1
        },
        totalRegistrations: 1,
        registrations: [registrationState]
      });
    }

    if (String(url).endsWith('/api/registrations/1/resend-confirmation')) {
      registrationState = {
        ...registrationState,
        email_delivery_status: 'Đã gửi',
        email_sent_at: '2026-04-05 18:15:00'
      };

      return createResponse(200, {
        message: 'Đã gửi lại email xác nhận thành công.',
        registration: registrationState
      });
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  const document = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };

  const windowObject = {
    location: {
      hostname: 'localhost',
      port: '5000',
      protocol: 'http:',
      origin: 'http://localhost:5000',
      href: 'http://localhost:5000/frontend/DanhSachDangKy.html',
      search: ''
    },
    history: {
      replaceState() {}
    },
    setTimeout,
    clearTimeout
  };

  const context = vm.createContext({
    window: windowObject,
    document,
    fetch,
    console,
    URL,
    URLSearchParams,
    requestAnimationFrame: (callback) => callback(),
    setTimeout,
    clearTimeout
  });

  vm.runInContext(scriptContent, context, { filename: 'DanhSachDangKy.js' });

  await flush();
  await flush();

  const tableBody = elements.get('registration-table-body');
  assert.ok(tableBody.listeners.has('click'));

  await tableBody.listeners.get('click')({
    target: {
      closest(selector) {
        if (selector === 'button[data-action="resend-email"]') {
          return {
            dataset: { registrationId: '1' },
            disabled: false
          };
        }
        return null;
      }
    }
  });

  await flush();
  await flush();

  const resendCall = fetchCalls.find((call) => call.url.endsWith('/api/registrations/1/resend-confirmation'));
  assert.ok(resendCall, 'Expected resend API call to be made');
  assert.equal(resendCall.options.method, 'POST');
  assert.equal(elements.get('page-message').textContent, 'Đã gửi lại email xác nhận thành công.');
});
