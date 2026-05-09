// Gmail integration. Railway/production uses explicit OAuth env vars; the
// Replit Google Mail connector remains as a fallback for old environments.
import { google } from 'googleapis';

let connectionSettings: any;

function getEnvGmailCredentials() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
  const user = process.env.GMAIL_USER || process.env.COMPANY_EMAIL || process.env.FROM_EMAIL;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return { clientId, clientSecret, refreshToken, user };
}

function getEnvGmailClient() {
  const credentials = getEnvGmailCredentials();
  if (!credentials) return null;

  const oauth2Client = new google.auth.OAuth2(credentials.clientId, credentials.clientSecret);
  oauth2Client.setCredentials({
    refresh_token: credentials.refreshToken,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function getAccessToken() {
  const envCredentials = getEnvGmailCredentials();
  if (envCredentials) {
    const oauth2Client = new google.auth.OAuth2(envCredentials.clientId, envCredentials.clientSecret);
    oauth2Client.setCredentials({ refresh_token: envCredentials.refreshToken });
    const accessToken = await oauth2Client.getAccessToken();
    if (accessToken.token) return accessToken.token;
    throw new Error('Gmail OAuth refresh token did not return an access token');
  }

  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const envClient = getEnvGmailClient();
  if (envClient) return envClient;

  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
}

function buildRawEmail(to: string, from: string, subject: string, html?: string, text?: string): string {
  const boundary = 'boundary_' + Date.now();
  const lines = [
    `From: JC ON THE MOVE <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text || (html ? html.replace(/<[^>]*>/g, '') : ''),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html || text || '',
    `--${boundary}--`,
  ];

  const rawMessage = lines.join('\r\n');
  return Buffer.from(rawMessage).toString('base64url');
}

export async function sendGmailEmail(params: {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<boolean> {
  try {
    const gmail = await getUncachableGmailClient();
    const envCredentials = getEnvGmailCredentials();
    const from = envCredentials?.user || params.from;
    const raw = buildRawEmail(params.to, from, params.subject, params.html, params.text);
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    
    console.log(`📧 Gmail: Email sent to ${params.to} - "${params.subject}"`);
    return true;
  } catch (error: any) {
    console.error('Gmail send error:', error?.message || error);
    return false;
  }
}

export async function isGmailAvailable(): Promise<boolean> {
  try {
    if (getEnvGmailCredentials()) return true;
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
