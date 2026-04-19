const { Resend } = require("resend");
const QRCode = require("qrcode");

const EMAIL_STATUS = Object.freeze({
  PENDING: "Chờ gửi",
  SENT: "Đã gửi",
  FAILED: "Gửi thất bại"
});

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function buildQrPayload({ event, registration }) {
  return [
    "VE THAM DU SU KIEN",
    `Ma dang ky: ${registration.id}`,
    `Su kien: ${event.title}`,
    `Thoi gian: ${formatDateTime(event.event_time)}`,
    `Dia diem: ${event.location}`,
    `Ho va ten: ${registration.full_name}`,
    `MSSV: ${registration.student_id}`,
    `Email: ${registration.email}`,
    `So dien thoai: ${registration.phone || ""}`
  ].join("\n");
}

function getRequiredEnv(...keys) {
  for (const key of keys) {
    const value = normalizeString(process.env[key]);
    if (value) {
      return value;
    }
  }

  throw new Error(`Thiếu cấu hình bắt buộc: ${keys.join(" / ")}`);
}

function createMailerTransport() {
  const apiKey = getRequiredEnv("RESEND_API_KEY");
  return new Resend(apiKey);
}

function getFromEmail() {
  return getRequiredEnv(
    "RESEND_FROM_EMAIL",
    "MAIL_FROM_EMAIL",
    "EMAIL_FROM"
  );
}

function getFromName() {
  return (
    normalizeString(process.env.MAIL_FROM_NAME || process.env.EMAIL_FROM_NAME) ||
    "Club Event Manager"
  );
}

function buildFromHeader() {
  const fromName = getFromName();
  const fromEmail = getFromEmail();
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

function buildConfirmationEmailHtml({ event, registration, qrImageDataUrl }) {
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
        ${description ? `<p style="margin: 6px 0;"><strong>Mô tả:</strong> ${description}</p>` : ""}
      </div>

      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <h3 style="margin-top: 0; margin-bottom: 12px; color: #0f172a;">Thông tin người đăng ký</h3>
        <p style="margin: 6px 0;"><strong>Họ và tên:</strong> ${registration.full_name}</p>
        <p style="margin: 6px 0;"><strong>MSSV:</strong> ${registration.student_id}</p>
        <p style="margin: 6px 0;"><strong>Email:</strong> ${registration.email}</p>
        <p style="margin: 6px 0;"><strong>Số điện thoại:</strong> ${registration.phone || ""}</p>
        <p style="margin: 6px 0;"><strong>Mã đăng ký:</strong> ${registration.id}</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <p style="margin-bottom: 12px;"><strong>Mã QR vé tham dự</strong></p>
        <img src="${qrImageDataUrl}" alt="QR code ve tham du" style="width: 220px; height: 220px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; background: #ffffff;" />
      </div>

      <p style="margin-top: 24px;">Trân trọng,<br />Ban tổ chức sự kiện</p>
    </div>
  `;
}

function buildConfirmationEmailText({ event, registration }) {
  return [
    "Xac nhan dang ky su kien thanh cong",
    `Ten su kien: ${event.title}`,
    `Thoi gian: ${formatDateTime(event.event_time)}`,
    `Dia diem: ${event.location}`,
    `Nguoi dang ky: ${registration.full_name}`,
    `MSSV: ${registration.student_id}`,
    `Email: ${registration.email}`,
    `So dien thoai: ${registration.phone || ""}`,
    `Ma dang ky: ${registration.id}`,
    "Email nay kem ma QR de lam ve tham du."
  ].join("\n");
}

function buildFeedbackInvitationHtml({ event, registration, feedbackUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px; margin: 0 auto;">
      <h2 style="color: #0f172a; margin-bottom: 8px;">Mời bạn gửi phản hồi sau sự kiện</h2>
      <p>Chào <strong>${registration.full_name}</strong>,</p>
      <p>Cảm ơn bạn đã tham gia sự kiện <strong>${event.title}</strong>.</p>
      <p>Ban tổ chức rất mong nhận được phản hồi từ bạn để cải thiện các sự kiện sau.</p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <p style="margin: 6px 0;"><strong>Sự kiện:</strong> ${event.title}</p>
        <p style="margin: 6px 0;"><strong>Thời gian:</strong> ${formatDateTime(event.event_time)}</p>
        <p style="margin: 6px 0;"><strong>Địa điểm:</strong> ${normalizeString(event.location)}</p>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a
          href="${feedbackUrl}"
          style="display: inline-block; padding: 12px 20px; border-radius: 10px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700;"
        >
          Gửi feedback ngay
        </a>
      </div>

      <p>Nếu nút không bấm được, bạn có thể mở link này:</p>
      <p><a href="${feedbackUrl}">${feedbackUrl}</a></p>

      <p style="margin-top: 24px;">Trân trọng,<br />Ban tổ chức sự kiện</p>
    </div>
  `;
}

function buildFeedbackInvitationText({ event, registration, feedbackUrl }) {
  return [
    "Moi ban gui phan hoi sau su kien",
    `Chao ${registration.full_name},`,
    `Cam on ban da tham gia su kien: ${event.title}`,
    `Thoi gian: ${formatDateTime(event.event_time)}`,
    `Dia diem: ${normalizeString(event.location)}`,
    `Link feedback: ${feedbackUrl}`
  ].join("\n");
}

async function sendWithResend({
  client,
  to,
  subject,
  html,
  text
}) {
  const resend = client || createMailerTransport();

  const payload = {
    from: buildFromHeader(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text
  };

  const response = await resend.emails.send(payload);

  if (response?.error) {
    throw new Error(response.error.message || "Gửi email thất bại.");
  }

  return {
    messageId: response?.data?.id || null,
    subject
  };
}

async function sendConfirmationEmail({ event, registration, qrPayload, transporter }) {
  const resolvedQrPayload = qrPayload || buildQrPayload({ event, registration });

  const qrImageDataUrl = await QRCode.toDataURL(resolvedQrPayload, {
    width: 360,
    margin: 1,
    errorCorrectionLevel: "M"
  });

  const subject = `[Xac nhan dang ky] ${event.title}`;

  const result = await sendWithResend({
    client: transporter,
    to: registration.email,
    subject,
    text: buildConfirmationEmailText({ event, registration }),
    html: buildConfirmationEmailHtml({
      event,
      registration,
      qrImageDataUrl
    })
  });

  return {
    messageId: result.messageId,
    qrPayload: resolvedQrPayload,
    subject
  };
}

async function sendFeedbackInvitationEmail({
  event,
  registration,
  feedbackUrl,
  transporter
}) {
  const subject = `[Feedback] ${event.title}`;

  const result = await sendWithResend({
    client: transporter,
    to: registration.email,
    subject,
    text: buildFeedbackInvitationText({
      event,
      registration,
      feedbackUrl
    }),
    html: buildFeedbackInvitationHtml({
      event,
      registration,
      feedbackUrl
    })
  });

  return {
    messageId: result.messageId,
    subject,
    feedbackUrl
  };
}

module.exports = {
  EMAIL_STATUS,
  buildQrPayload,
  createMailerTransport,
  sendConfirmationEmail,
  sendFeedbackInvitationEmail
};