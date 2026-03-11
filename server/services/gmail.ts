// Gmail integration via Replit Google Mail connection
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
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
    const raw = buildRawEmail(params.to, params.from, params.subject, params.html, params.text);
    
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
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
