import twilio from "twilio";

export interface SMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
const TWILIO_API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;
const TWILIO_FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (phone.startsWith("+")) {
    return phone;
  }
  return `+1${digits}`;
}

function getTwilioClient() {
  if (!TWILIO_ACCOUNT_SID) {
    throw new Error("TWILIO_ACCOUNT_SID is not configured");
  }

  if (TWILIO_API_KEY && TWILIO_API_KEY_SECRET) {
    return twilio(TWILIO_API_KEY, TWILIO_API_KEY_SECRET, {
      accountSid: TWILIO_ACCOUNT_SID,
    });
  }

  if (!TWILIO_AUTH_TOKEN) {
    throw new Error("TWILIO_AUTH_TOKEN is not configured");
  }

  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

function senderPayload() {
  if (TWILIO_MESSAGING_SERVICE_SID) {
    return { messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID };
  }
  if (TWILIO_FROM_NUMBER) {
    return { from: TWILIO_FROM_NUMBER };
  }
  throw new Error("TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID is not configured");
}

export class SMSService {
  private initialized = false;
  private initError: string | null = null;

  async initialize(): Promise<boolean> {
    try {
      getTwilioClient();
      senderPayload();
      this.initialized = true;
      this.initError = null;
      console.log("[sms] Twilio SMS service initialized successfully");
      return true;
    } catch (error) {
      this.initialized = false;
      this.initError = error instanceof Error ? error.message : "Unknown error";
      console.warn(`[sms] SMS service not available: ${this.initError}`);
      return false;
    }
  }

  async sendSMS(to: string, message: string): Promise<SMSResult> {
    try {
      const client = getTwilioClient();
      const formattedTo = formatPhoneNumber(to);
      const result = await client.messages.create({
        body: message,
        to: formattedTo,
        ...senderPayload(),
      });

      console.log(`[sms] SMS sent to ${to}: ${result.sid}`);
      return { success: true, messageSid: result.sid };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown SMS error";
      console.error(`[sms] SMS failed to ${to}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async notifyNewQuote(leadData: {
    customerName: string;
    serviceType: string;
    phone?: string;
    moveDate?: string;
  }): Promise<SMSResult> {
    if (!ADMIN_PHONE) {
      console.warn("[sms] ADMIN_PHONE_NUMBER not set, skipping SMS notification");
      return { success: false, error: "Admin phone number not configured" };
    }

    const message = `NEW QUOTE REQUEST\n\nCustomer: ${leadData.customerName}\nService: ${leadData.serviceType}\nPhone: ${leadData.phone || "Not provided"}\nMove Date: ${leadData.moveDate || "Not specified"}\n\nCheck the dashboard for details.`;
    return this.sendSMS(ADMIN_PHONE, message);
  }

  async notifyJobCompleted(jobData: {
    customerName: string;
    serviceType: string;
    completedBy?: string;
  }): Promise<SMSResult> {
    if (!ADMIN_PHONE) {
      console.warn("[sms] ADMIN_PHONE_NUMBER not set, skipping SMS notification");
      return { success: false, error: "Admin phone number not configured" };
    }

    const message = `JOB COMPLETED\n\nCustomer: ${jobData.customerName}\nService: ${jobData.serviceType}${jobData.completedBy ? `\nCompleted by: ${jobData.completedBy}` : ""}\n\nJob marked as complete.`;
    return this.sendSMS(ADMIN_PHONE, message);
  }

  async notifyJobAvailable(employeePhone: string, jobData: {
    customerName: string;
    serviceType: string;
    moveDate?: string;
    tokensReward?: number;
  }): Promise<SMSResult> {
    const message = `NEW JOB AVAILABLE\n\nCustomer: ${jobData.customerName}\nService: ${jobData.serviceType}\nDate: ${jobData.moveDate || "TBD"}${jobData.tokensReward ? `\nReward: ${jobData.tokensReward.toLocaleString()} JCMOVES` : ""}\n\nOpen the app to claim this job.`;
    return this.sendSMS(employeePhone, message);
  }

  async notifyNewLead(leadData: {
    customerName: string;
    serviceType: string;
    phone?: string;
    createdBy?: string;
    hasMediaLink?: boolean;
  }): Promise<SMSResult> {
    if (!ADMIN_PHONE) {
      console.warn("[sms] ADMIN_PHONE_NUMBER not set, skipping SMS notification");
      return { success: false, error: "Admin phone number not configured" };
    }

    const message = `NEW LEAD CREATED\n\nCustomer: ${leadData.customerName}\nService: ${leadData.serviceType}\nPhone: ${leadData.phone || "Not provided"}${leadData.createdBy ? `\nCreated by: ${leadData.createdBy}` : ""}${leadData.hasMediaLink ? "\nCustomer media link included" : ""}\n\nCheck the dashboard to review.`;
    return this.sendSMS(ADMIN_PHONE, message);
  }

  isAvailable(): boolean {
    return this.initialized && !this.initError;
  }
}

export const smsService = new SMSService();
