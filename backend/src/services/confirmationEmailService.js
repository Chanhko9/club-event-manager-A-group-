const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

const EMAIL_STATUS = Object.freeze({
  PENDING: 'Chờ gửi',
  SENT: 'Đã gửi',
  FAILED: 'Gửi thất bại'
});

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function buildQrPayload({ event, registration }) {
  return [
    'VE THAM DU SU KIEN',
    `Ma dang ky: ${registration.id}`,
    `Su kien: ${event.title}`,
    `Thoi gian: ${formatDateTime(event.event_time)}`,
    `Dia diem: ${event.location}`,
    `Ho va ten: ${registration.full_name}`,
    `MSSV: ${registration.student_id}`,
    `Email: ${registration.email}`,
    `So dien thoai: ${registration.phone || ''}`
  ].join('\n');
}

function buildEmailHtml({ event, registration, qrContentId }) {
  const eventTitle = normalizeString(event.title);
  const eventTime = formatDateTime(event.event_time);
  const location = normalizeString(event.location);
  const description = normalizeString(event.description);

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto;">
      <h2 style="color: #0f172a; margin-bottom: 8px;">Xác nhận đăng ký sự kiện thành công</h2>
      <p>Chào <strong>${registration.full_name}</strong>,</p>
      <p>Bạn đã đăng ký thành công sự kiện. Vui lòng sử dụng email này làm vé tham dự.</p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <h3 style="margin-top: 0; margin-bottom: 12px; color: #0f172a;">Thông tin sự kiện</h3>
        <p style="margin: 6px 0;"><strong>Tên sự kiện:</strong> ${eventTitle}</p>
        <p style="margin: 6px 0;"><strong>Thời gian:</strong> ${eventTime}</p>
        <p style="margin: 6px 0;"><strong>Địa điểm:</strong> ${location}</p>
        ${description ? `<p style="margin: 6px 0;"><strong>Mô tả:</strong> ${description}</p>` : ''}
      </div>

      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <h3 style="margin-top: 0; margin-bottom: 12px; color: #0f172a;">Thông tin người đăng ký</h3>
        <p style="margin: 6px 0;"><strong>Họ và tên:</strong> ${registration.full_name}</p>
        <p style="margin: 6px 0;"><strong>MSSV:</strong> ${registration.student_id}</p>
        <p style="margin: 6px 0;"><strong>Email:</strong> ${registration.email}</p>
        <p style="margin: 6px 0;"><strong>Số điện thoại:</strong> ${registration.phone || ''}</p>
        <p style="margin: 6px 0;"><strong>Mã đăng ký:</strong> ${registration.id}</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="margin-bottom: 12px;"><strong>Mã QR vé tham dự</strong></p>
        <img src="cid:${qrContentId}" alt="QR code ve tham du" style="width: 220px; height: 220px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; background: #ffffff;" />
      </div>

      <p style="margin-top: 24px;">Trân trọng,<br />Ban tổ chức sự kiện</p>
    </div>
  `;
}

function buildEmailText({ event, registration }) {
  return [
    'Xac nhan dang ky su kien thanh cong',
    `Ten su kien: ${event.title}`,
    `Thoi gian: ${formatDateTime(event.event_time)}`,
    `Dia diem: ${event.location}`,
    `Nguoi dang ky: ${registration.full_name}`,
    `MSSV: ${registration.student_id}`,
    `Email: ${registration.email}`,
    `So dien thoai: ${registration.phone || ''}`,
    `Ma dang ky: ${registration.id}`,
    'Email nay kem ma QR de lam ve tham du.'
  ].join('\n');
}

function createMailerTransport() {
  const host = normalizeString(process.env.SMTP_HOST);
  const user = normalizeString(process.env.SMTP_USER);
  const pass = normalizeString(process.env.SMTP_PASS);
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

  if (!host || !user || !pass) {
    throw new Error('Thiếu cấu hình SMTP để gửi email xác nhận.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
}

async function sendConfirmationEmail({ event, registration, transporter }) {
  const mailer = transporter || createMailerTransport();
  const qrPayload = buildQrPayload({ event, registration });
  const qrBuffer = await QRCode.toBuffer(qrPayload, {
    type: 'png',
    width: 360,
    margin: 1,
    errorCorrectionLevel: 'M'
  });

  const qrContentId = `registration-qrcode-${registration.id}@club-event-manager`;
  const fromName = normalizeString(process.env.MAIL_FROM_NAME) || 'Club Event Manager';
  const fromEmail = normalizeString(process.env.MAIL_FROM_EMAIL) || normalizeString(process.env.SMTP_USER);

  if (!fromEmail) {
    throw new Error('Thiếu địa chỉ email gửi đi.');
  }

  const subject = `[Xac nhan dang ky] ${event.title}`;

  const info = await mailer.sendMail({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: registration.email,
    subject,
    text: buildEmailText({ event, registration }),
    html: buildEmailHtml({ event, registration, qrContentId }),
    attachments: [
      {
        filename: `qr-ve-su-kien-${registration.id}.png`,
        content: qrBuffer,
        cid: qrContentId,
        contentType: 'image/png'
      }
    ]
  });

  return {
    messageId: info && info.messageId ? info.messageId : null,
    qrPayload,
    subject
  };
}

module.exports = {
  EMAIL_STATUS,
  buildQrPayload,
  createMailerTransport,
  sendConfirmationEmail
};
