const test = require('node:test');
const assert = require('node:assert/strict');

const servicePath = require.resolve('../src/services/confirmationEmailService.js');
const nodemailerPath = require.resolve('nodemailer');
const qrcodePath = require.resolve('qrcode');

function clearModule(modulePath) {
  delete require.cache[modulePath];
}

test('sendConfirmationEmail dùng lại qrPayload được truyền vào khi resend', async (t) => {
  const originalNodeMailer = require.cache[nodemailerPath];
  const originalQrCode = require.cache[qrcodePath];
  let qrInput = null;
  let sendMailPayload = null;

  require.cache[nodemailerPath] = {
    id: nodemailerPath,
    filename: nodemailerPath,
    loaded: true,
    exports: {
      createTransport() {
        return {
          async sendMail(payload) {
            sendMailPayload = payload;
            return { messageId: 'mock-message-id' };
          }
        };
      }
    }
  };

  require.cache[qrcodePath] = {
    id: qrcodePath,
    filename: qrcodePath,
    loaded: true,
    exports: {
      async toBuffer(input) {
        qrInput = input;
        return Buffer.from(String(input));
      }
    }
  };

  clearModule(servicePath);
  const service = require('../src/services/confirmationEmailService.js');

  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'sender@example.com';
  process.env.SMTP_PASS = 'secret';

  const event = {
    title: 'Workshop Resend QR',
    event_time: '2026-04-08 18:00:00',
    location: 'Phong A1',
    description: 'Mo ta'
  };
  const registration = {
    id: 7,
    full_name: 'Nguyen Van Test',
    student_id: 'SV007',
    email: 'sv007@example.com',
    phone: '0909000000'
  };
  const storedQrPayload = 'QR-PAYLOAD-OLD';

  const result = await service.sendConfirmationEmail({
    event,
    registration,
    qrPayload: storedQrPayload
  });

  assert.equal(result.qrPayload, storedQrPayload);
  assert.equal(qrInput, storedQrPayload);
  assert.equal(sendMailPayload.to, 'sv007@example.com');
  assert.equal(sendMailPayload.attachments[0].content.toString(), storedQrPayload);

  t.after(() => {
    clearModule(servicePath);
    if (originalNodeMailer) {
      require.cache[nodemailerPath] = originalNodeMailer;
    } else {
      delete require.cache[nodemailerPath];
    }
    if (originalQrCode) {
      require.cache[qrcodePath] = originalQrCode;
    } else {
      delete require.cache[qrcodePath];
    }
  });
});
