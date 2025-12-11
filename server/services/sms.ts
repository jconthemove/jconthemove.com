import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

export interface SMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER;

export class SMSService {
  private initialized = false;
  private initError: string | null = null;

  async initialize(): Promise<boolean> {
    try {
      await getTwilioClient();
      this.initialized = true;
      console.log('✅ Twilio SMS service initialized successfully');
      return true;
    } catch (error) {
      this.initError = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`⚠️ SMS service not available: ${this.initError}`);
      return false;
    }
  }

  async sendSMS(to: string, message: string): Promise<SMSResult> {
    try {
      const client = await getTwilioClient();
      const fromNumber = await getTwilioFromPhoneNumber();

      if (!fromNumber) {
        return { success: false, error: 'No Twilio phone number configured' };
      }

      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: to
      });

      console.log(`📱 SMS sent to ${to}: ${result.sid}`);
      return { success: true, messageSid: result.sid };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown SMS error';
      console.error(`❌ SMS failed to ${to}:`, errorMessage);
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
      console.warn('ADMIN_PHONE_NUMBER not set, skipping SMS notification');
      return { success: false, error: 'Admin phone number not configured' };
    }

    const message = `🚚 NEW QUOTE REQUEST\n\nCustomer: ${leadData.customerName}\nService: ${leadData.serviceType}\nPhone: ${leadData.phone || 'Not provided'}\nMove Date: ${leadData.moveDate || 'Not specified'}\n\nCheck the dashboard for details.`;

    return this.sendSMS(ADMIN_PHONE, message);
  }

  async notifyJobCompleted(jobData: {
    customerName: string;
    serviceType: string;
    completedBy?: string;
  }): Promise<SMSResult> {
    if (!ADMIN_PHONE) {
      console.warn('ADMIN_PHONE_NUMBER not set, skipping SMS notification');
      return { success: false, error: 'Admin phone number not configured' };
    }

    const message = `✅ JOB COMPLETED\n\nCustomer: ${jobData.customerName}\nService: ${jobData.serviceType}${jobData.completedBy ? `\nCompleted by: ${jobData.completedBy}` : ''}\n\nJob marked as complete.`;

    return this.sendSMS(ADMIN_PHONE, message);
  }

  async notifyJobAvailable(employeePhone: string, jobData: {
    customerName: string;
    serviceType: string;
    moveDate?: string;
    tokensReward?: number;
  }): Promise<SMSResult> {
    const message = `🚚 NEW JOB AVAILABLE\n\nCustomer: ${jobData.customerName}\nService: ${jobData.serviceType}\nDate: ${jobData.moveDate || 'TBD'}${jobData.tokensReward ? `\nReward: ${jobData.tokensReward.toLocaleString()} JCMOVES` : ''}\n\nOpen the app to claim this job!`;

    return this.sendSMS(employeePhone, message);
  }

  async notifyNewLead(leadData: {
    customerName: string;
    serviceType: string;
    phone?: string;
    createdBy?: string;
  }): Promise<SMSResult> {
    if (!ADMIN_PHONE) {
      console.warn('ADMIN_PHONE_NUMBER not set, skipping SMS notification');
      return { success: false, error: 'Admin phone number not configured' };
    }

    const message = `📋 NEW LEAD CREATED\n\nCustomer: ${leadData.customerName}\nService: ${leadData.serviceType}\nPhone: ${leadData.phone || 'Not provided'}${leadData.createdBy ? `\nCreated by: ${leadData.createdBy}` : ''}\n\nCheck the dashboard to review.`;

    return this.sendSMS(ADMIN_PHONE, message);
  }

  isAvailable(): boolean {
    return this.initialized && !this.initError;
  }
}

export const smsService = new SMSService();
