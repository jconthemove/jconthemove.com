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
