import { MailService } from '@sendgrid/mail';
import { sendGmailEmail, isGmailAvailable } from './gmail';

let isEmailServiceAvailable = false;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

if (!SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable not set. SendGrid fallback will be disabled.");
} else if (!SENDGRID_API_KEY.startsWith('SG.')) {
  console.warn("Invalid SENDGRID_API_KEY format - SendGrid fallback will be disabled.");
} else {
  isEmailServiceAvailable = true;
}

const mailService = new MailService();

if (isEmailServiceAvailable && SENDGRID_API_KEY) {
  try {
    mailService.setApiKey(SENDGRID_API_KEY);
    console.log("SendGrid email service initialized successfully");
  } catch (error) {
    console.error("Failed to initialize SendGrid service:", error);
    isEmailServiceAvailable = false;
  }
}

isGmailAvailable().then(available => {
  if (available) {
    console.log("Gmail email service available (primary)");
  } else {
    console.log("Gmail not available, will use SendGrid as primary");
  }
}).catch(() => {});

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  // Try Gmail first (primary)
  try {
    const gmailAvailable = await isGmailAvailable();
    if (gmailAvailable) {
      const sent = await sendGmailEmail(params);
      if (sent) return true;
      console.log("Gmail send failed, falling back to SendGrid...");
    }
  } catch (err) {
    console.log("Gmail unavailable, falling back to SendGrid...");
  }

  // Fall back to SendGrid
  if (!isEmailServiceAvailable) {
    console.log('Email service not available. Email would be sent:', {
      to: params.to,
      from: params.from,
      subject: params.subject,
      hasText: !!params.text,
      hasHtml: !!params.html
    });
    return true;
  }

  try {
    const emailData: any = {
      to: params.to,
      from: params.from,
      subject: params.subject,
    };
    
    if (params.text) emailData.text = params.text;
    if (params.html) emailData.html = params.html;
    
    await mailService.send(emailData);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

export function generateLeadNotificationEmail(lead: any) {
  const html = `
    <h2>New Lead Submission - JC ON THE MOVE</h2>
    <p><strong>Service Type:</strong> ${lead.serviceType}</p>
    <p><strong>Customer:</strong> ${lead.firstName} ${lead.lastName}</p>
    <p><strong>Email:</strong> ${lead.email}</p>
    <p><strong>Phone:</strong> ${lead.phone}</p>
    <p><strong>From Address:</strong> ${lead.fromAddress}</p>
    ${lead.toAddress ? `<p><strong>To Address:</strong> ${lead.toAddress}</p>` : ''}
    ${lead.moveDate ? `<p><strong>Move Date:</strong> ${lead.moveDate}</p>` : ''}
    ${lead.propertySize ? `<p><strong>Property Size:</strong> ${lead.propertySize}</p>` : ''}
    ${lead.details ? `<p><strong>Additional Details:</strong> ${lead.details}</p>` : ''}
    <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
  `;

  const text = `
    New Lead Submission - JC ON THE MOVE
    
    Service Type: ${lead.serviceType}
    Customer: ${lead.firstName} ${lead.lastName}
    Email: ${lead.email}
    Phone: ${lead.phone}
    From Address: ${lead.fromAddress}
    ${lead.toAddress ? `To Address: ${lead.toAddress}` : ''}
    ${lead.moveDate ? `Move Date: ${lead.moveDate}` : ''}
    ${lead.propertySize ? `Property Size: ${lead.propertySize}` : ''}
    ${lead.details ? `Additional Details: ${lead.details}` : ''}
    Submitted: ${new Date().toLocaleString()}
  `;

  return { html, text };
}

/** Pull "City, ST" from a full address string, or return a safe fallback */
export function extractCityState(address: string | null | undefined): string {
  if (!address) return "Location TBD";
  const cleaned = address.trim();
  // Try: "123 Main St, Marquette, MI 49855"  →  ["123 Main St", "Marquette", "MI 49855"]
  const parts = cleaned.split(",").map(p => p.trim());
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1]; // "MI 49855" or "MI"
    const city = parts[parts.length - 2];     // "Marquette"
    const stateOnly = stateZip.split(" ")[0]; // "MI"
    return `${city}, ${stateOnly}`;
  }
  if (parts.length === 2) {
    return `${parts[0]}, ${parts[1].split(" ")[0]}`;
  }
  // Last resort — return up to 30 chars
  return cleaned.slice(0, 30);
}

/** Format service type label for worker-facing email */
function formatServiceLabel(serviceType: string): string {
  const labels: Record<string, string> = {
    moving: "Moving — Residential/Commercial",
    junk_removal: "Junk Removal",
    labor: "Labor Only (Loading / Unloading)",
    snow_removal: "Snow Removal",
    lawn_care: "Lawn Care",
    window_cleaning: "Window Cleaning",
    handyman: "Handyman Services",
    cleaning: "Cleaning",
    trash_valet: "Trash Valet",
    assembly: "Furniture Assembly",
  };
  return labels[serviceType] || serviceType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function generateWorkerDispatchEmail(lead: any, worker: any): { html: string; text: string } {
  const HOURLY_RATE = 85;
  const cityState = extractCityState(lead.confirmedFromAddress || lead.fromAddress);
  const jobDate = lead.confirmedDate || lead.moveDate || "TBD";
  const arrivalWindow = lead.arrivalWindow || "Time TBD — admin will confirm";
  const hours = lead.confirmedHours ? Number(lead.confirmedHours) : null;
  const estimatedPay = hours ? (hours * HOURLY_RATE).toFixed(2) : null;
  const serviceLabel = formatServiceLabel(lead.serviceType || "service");
  const customerFirst = lead.firstName || "your customer";
  const workerFirst = worker.firstName || worker.username || "Crew Member";
  const details = lead.details || "";
  const dispatchNotes = lead.dispatchNotes || "";
  const quoteNotes = lead.quoteNotes || "";
  const combinedNotes = [quoteNotes, dispatchNotes].filter(Boolean).join("\n\n");
  const companyPhone = process.env.COMPANY_PHONE || "(906) 231-7906";
  const companyEmail = process.env.COMPANY_EMAIL || "michigankid906@gmail.com";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 32px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:1px;">JC ON THE MOVE</div>
          <div style="font-size:13px;color:#93c5fd;margin-top:4px;">Northwoods &amp; UP of Michigan</div>
          <div style="margin-top:16px;background:rgba(255,255,255,0.15);border-radius:8px;padding:10px 20px;display:inline-block;">
            <span style="font-size:16px;font-weight:700;color:#ffffff;">📋 You're Scheduled for a Job!</span>
          </div>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:24px 32px 8px;">
          <p style="margin:0;font-size:15px;color:#374151;">Hey <strong>${workerFirst}</strong>,</p>
          <p style="margin:8px 0 0;font-size:15px;color:#374151;">Here are the details for your upcoming job. Review everything below and reach out to JC if you have any questions.</p>
        </td></tr>

        <!-- Date / Time -->
        <tr><td style="padding:16px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-left:4px solid #2563eb;border-radius:6px;padding:14px 16px;">
            <tr>
              <td style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.8px;">📅 Date &amp; Arrival Window</td>
            </tr>
            <tr>
              <td style="font-size:18px;font-weight:700;color:#1e3a5f;padding-top:4px;">${jobDate}</td>
            </tr>
            <tr>
              <td style="font-size:15px;color:#374151;padding-top:2px;">${arrivalWindow}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Location -->
        <tr><td style="padding:12px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;">
            <tr><td style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">📍 Job Location</td></tr>
            <tr><td style="font-size:16px;font-weight:600;color:#111827;padding-top:4px;">${cityState}</td></tr>
            <tr><td style="font-size:12px;color:#9ca3af;padding-top:2px;">Full street address confirmed at dispatch — contact JC if needed</td></tr>
          </table>
        </td></tr>

        <!-- Two-column: Customer + Service -->
        <tr><td style="padding:12px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;vertical-align:top;">
                <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">👤 Customer</div>
                <div style="font-size:16px;font-weight:600;color:#111827;margin-top:4px;">${customerFirst}</div>
                <div style="font-size:12px;color:#9ca3af;margin-top:2px;">First name only</div>
              </td>
              <td width="4%"></td>
              <td width="48%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;vertical-align:top;">
                <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">🔧 Service Type</div>
                <div style="font-size:14px;font-weight:600;color:#111827;margin-top:4px;">${serviceLabel}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        ${details ? `
        <!-- Job Details -->
        <tr><td style="padding:12px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;">
            <tr><td style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">📝 What the Job Involves</td></tr>
            <tr><td style="font-size:14px;color:#374151;padding-top:6px;line-height:1.6;">${details.replace(/\n/g, '<br>')}</td></tr>
          </table>
        </td></tr>` : ''}

        <!-- Pay Estimate -->
        <tr><td style="padding:12px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;padding:14px 16px;">
            <tr><td style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.8px;">💰 Your Estimated Pay</td></tr>
            ${hours ? `
            <tr><td style="font-size:20px;font-weight:800;color:#15803d;padding-top:6px;">$${estimatedPay}</td></tr>
            <tr><td style="font-size:13px;color:#4ade80;margin-top:2px;">${hours} hr${hours !== 1 ? 's' : ''} × $${HOURLY_RATE}/hr</td></tr>
            ` : `
            <tr><td style="font-size:14px;color:#374151;padding-top:6px;">Hours TBD — admin will confirm. Rate: $${HOURLY_RATE}/hr</td></tr>
            `}
          </table>
        </td></tr>

        ${combinedNotes ? `
        <!-- Admin Notes -->
        <tr><td style="padding:12px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;padding:14px 16px;">
            <tr><td style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.8px;">📋 Notes from JC</td></tr>
            <tr><td style="font-size:14px;color:#374151;padding-top:6px;line-height:1.6;">${combinedNotes.replace(/\n/g, '<br>')}</td></tr>
          </table>
        </td></tr>` : ''}

        <!-- Contact Footer -->
        <tr><td style="padding:20px 32px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a5f;border-radius:8px;padding:16px 20px;">
            <tr><td style="color:#93c5fd;font-size:13px;font-weight:600;">Questions or can't make it?</td></tr>
            <tr><td style="color:#ffffff;font-size:14px;padding-top:4px;">Reply to this email or reach JC directly:</td></tr>
            <tr><td style="color:#60a5fa;font-size:14px;padding-top:4px;">📞 ${companyPhone} &nbsp;|&nbsp; ✉️ ${companyEmail}</td></tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;text-align:center;">JC ON THE MOVE LLC — Northwoods &amp; UP of Michigan</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `
JC ON THE MOVE — You're Scheduled for a Job!
=============================================

Hey ${workerFirst},

Here are your job details:

DATE & TIME
-----------
${jobDate}
${arrivalWindow}

LOCATION
--------
${cityState}
(Full address confirmed at dispatch — contact JC if needed)

CUSTOMER: ${customerFirst} (first name only)

SERVICE: ${serviceLabel}

${details ? `WHAT THE JOB INVOLVES\n---------------------\n${details}\n` : ''}
ESTIMATED PAY
-------------
${hours ? `${hours} hr${hours !== 1 ? 's' : ''} × $${HOURLY_RATE}/hr = $${estimatedPay}` : `Rate: $${HOURLY_RATE}/hr — hours TBD`}

${combinedNotes ? `NOTES FROM JC\n-------------\n${combinedNotes}\n` : ''}
QUESTIONS?
----------
Reply to this email or contact JC:
Phone: ${companyPhone}
Email: ${companyEmail}

— JC ON THE MOVE LLC, Northwoods & UP of Michigan
  `;

  return { html, text };
}

export function generateContactNotificationEmail(contact: any) {
  const html = `
    <h2>New Contact Form Submission - JC ON THE MOVE</h2>
    <p><strong>Name:</strong> ${contact.name}</p>
    <p><strong>Email:</strong> ${contact.email}</p>
    ${contact.phone ? `<p><strong>Phone:</strong> ${contact.phone}</p>` : ''}
    <p><strong>Message:</strong></p>
    <p>${contact.message}</p>
    <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
  `;

  const text = `
    New Contact Form Submission - JC ON THE MOVE
    
    Name: ${contact.name}
    Email: ${contact.email}
    ${contact.phone ? `Phone: ${contact.phone}` : ''}
    Message: ${contact.message}
    Submitted: ${new Date().toLocaleString()}
  `;

  return { html, text };
}
