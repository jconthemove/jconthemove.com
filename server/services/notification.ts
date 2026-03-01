import webpush from 'web-push';
import { storage } from '../storage';
import type { InsertNotification } from '@shared/schema';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:upmichiganstatemovers@gmail.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn('[PushNotification] VAPID keys not configured — push notifications disabled');
}

export interface NotificationData {
  userId: string;
  type: 'job_assigned' | 'job_status_change' | 'new_message' | 'system_alert' | 'mining_complete' | 'reward_available';
  title: string;
  message: string;
  data?: any;
}

export class NotificationService {
  private vapidReady = !!(vapidPublicKey && vapidPrivateKey);

  async createNotification(notificationData: NotificationData): Promise<void> {
    try {
      const insertData: InsertNotification = {
        userId: notificationData.userId,
        type: notificationData.type as any,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data,
      };
      await storage.createNotification(insertData);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  async sendPushNotification(
    userId: string,
    notification: { title: string; body: string; tag?: string; requireInteraction?: boolean; data?: any }
  ): Promise<void> {
    if (!this.vapidReady) return;
    try {
      const user = await storage.getUser(userId);
      if (!user?.pushSubscription) return;

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        tag: notification.tag || 'jcmove-notification',
        requireInteraction: notification.requireInteraction ?? false,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        data: { url: '/rewards', ...(notification.data || {}) },
      });

      await webpush.sendNotification(user.pushSubscription as webpush.PushSubscription, payload);
      console.log(`[PushNotification] Sent to user ${userId}: ${notification.title}`);
    } catch (error: any) {
      if (error?.statusCode === 410) {
        // Subscription expired — clear it
        await storage.updateUserPushSubscription(userId, null as any);
        console.log(`[PushNotification] Cleared expired subscription for ${userId}`);
      } else {
        console.error('[PushNotification] Error sending push:', error?.message || error);
      }
    }
  }

  async sendNotification(notificationData: NotificationData): Promise<void> {
    await this.createNotification(notificationData);
    await this.sendPushNotification(notificationData.userId, {
      title: notificationData.title,
      body: notificationData.message,
      data: notificationData.data,
    });
  }

  // Mining / rewards push helpers
  async notifyMiningComplete(userId: string, tokensEarned: number): Promise<void> {
    await this.sendPushNotification(userId, {
      title: '⛏️ Mining Session Complete!',
      body: `${tokensEarned.toLocaleString()} JCMOVES are ready to claim. Tap to collect!`,
      tag: 'mining-complete',
      requireInteraction: true,
      data: { url: '/rewards', type: 'mining_complete' },
    });
    await this.createNotification({
      userId,
      type: 'mining_complete',
      title: '⛏️ Mining Session Complete!',
      message: `${tokensEarned.toLocaleString()} JCMOVES are ready to claim.`,
      data: { type: 'mining_complete', tokens: tokensEarned },
    });
  }

  async notifyRewardAvailable(userId: string, rewardType: string, amount: number): Promise<void> {
    const label = rewardType.replace(/_/g, ' ');
    await this.sendPushNotification(userId, {
      title: '🎉 New Reward Available!',
      body: `You earned ${amount.toLocaleString()} JCMOVES for ${label}`,
      tag: 'reward-available',
      data: { url: '/rewards', type: 'reward_available' },
    });
    await this.createNotification({
      userId,
      type: 'reward_available',
      title: '🎉 New Reward Available!',
      message: `You earned ${amount.toLocaleString()} JCMOVES for ${label}`,
      data: { type: 'reward_available', rewardType, amount },
    });
  }

  // Existing helpers (jobs, alerts)
  async notifyJobAssigned(userId: string, jobId: string, customerName: string): Promise<void> {
    await this.sendNotification({
      userId,
      type: 'job_assigned',
      title: 'New Job Assigned',
      message: `You've been assigned a new job for ${customerName}`,
      data: { jobId, type: 'job_assigned' },
    });
  }

  async notifyJobStatusChange(userId: string, jobId: string, status: string, customerName: string): Promise<void> {
    await this.sendNotification({
      userId,
      type: 'job_status_change',
      title: 'Job Status Updated',
      message: `Job for ${customerName} is now ${status}`,
      data: { jobId, status, type: 'job_status_change' },
    });
  }

  async notifySystemAlert(userId: string, title: string, message: string): Promise<void> {
    await this.sendNotification({
      userId,
      type: 'system_alert',
      title,
      message,
      data: { type: 'system_alert' },
    });
  }

  async notifyAllEmployees(title: string, message: string, data?: any): Promise<void> {
    try {
      const employees = await storage.getEmployees();
      for (const employee of employees) {
        await this.sendNotification({
          userId: employee.id,
          type: 'system_alert',
          title,
          message,
          data,
        });
      }
    } catch (error) {
      console.error('Error notifying all employees:', error);
    }
  }
}

export const notificationService = new NotificationService();
