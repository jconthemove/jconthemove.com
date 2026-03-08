export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

const VAPID_PUBLIC_KEY = 'BFveYlkHTlnZsPBa4mWnX1pN-iOQskYGQh_SPrRJPZTpEFMFI9jTlf5iokygJORfaMtIE62eLAAnKP8pExq4QVc';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

class PushNotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;

  isSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }

  getPermissionStatus(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await this.subscribeToServerPush();
      }
      return permission;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }

  async getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (this.swRegistration) return this.swRegistration;
    if (!('serviceWorker' in navigator)) return null;
    try {
      this.swRegistration = await navigator.serviceWorker.ready;
      return this.swRegistration;
    } catch {
      return null;
    }
  }

  async subscribeToServerPush(): Promise<boolean> {
    try {
      const registration = await this.getSwRegistration();
      if (!registration) return false;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(subscription.toJSON()),
      });

      return res.ok;
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      return false;
    }
  }

  async showLocalNotification(options: NotificationOptions): Promise<void> {
    if (!this.isSupported()) return;
    if (Notification.permission !== 'granted') return;

    try {
      const registration = await this.getSwRegistration();
      if (registration) {
        await registration.showNotification(options.title, {
          body: options.body,
          icon: options.icon || '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: options.tag,
          requireInteraction: options.requireInteraction ?? false,
          data: { url: '/rewards' },
        } as NotificationOptions);
      } else {
        new Notification(options.title, {
          body: options.body,
          icon: options.icon || '/favicon.ico',
          tag: options.tag,
        });
      }
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  async notifyMiningComplete(tokensEarned: number): Promise<void> {
    await this.showLocalNotification({
      title: '⛏️ Mining Session Complete!',
      body: `You earned ${tokensEarned.toLocaleString()} JCMOVES tokens. Tap to claim your rewards!`,
      tag: 'mining-complete',
      requireInteraction: true,
    });
  }

  async notifyCanClaim(accumulatedTokens: number): Promise<void> {
    await this.showLocalNotification({
      title: '🪙 Tokens Ready to Claim!',
      body: `${accumulatedTokens.toLocaleString()} JCMOVES are waiting for you. Tap to claim now!`,
      tag: 'mining-ready',
      requireInteraction: true,
    });
  }

  async notifyNewReward(rewardType: string, amount: number): Promise<void> {
    await this.showLocalNotification({
      title: '🎉 New Reward Available!',
      body: `You received ${amount.toLocaleString()} JCMOVES for ${rewardType}`,
      tag: 'new-reward',
    });
  }

  async notifyStreakBonus(streakCount: number, bonusAmount: number): Promise<void> {
    await this.showLocalNotification({
      title: `🔥 ${streakCount}-Day Streak!`,
      body: `Streak bonus: +${bonusAmount.toLocaleString()} JCMOVES! Keep it going!`,
      tag: 'streak-bonus',
    });
  }

  async notifyDailyCheckInReady(): Promise<void> {
    await this.showLocalNotification({
      title: '📅 Daily Rewards Ready!',
      body: "Your daily mining rewards are ready to claim. Don't break your streak!",
      tag: 'daily-checkin',
      requireInteraction: true,
    });
  }
}

export const notificationService = new PushNotificationService();
