export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}

class PushNotificationService {
  private permissionStatus: NotificationPermission = 'default';

  constructor() {
    if (this.isSupported()) {
      this.permissionStatus = Notification.permission;
    }
  }

  isSupported(): boolean {
    return 'Notification' in window;
  }

  getPermissionStatus(): NotificationPermission {
    return this.permissionStatus;
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      console.warn('Push notifications are not supported in this browser');
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionStatus = permission;
      return permission;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }

  async showNotification(options: NotificationOptions): Promise<Notification | null> {
    if (!this.isSupported()) {
      console.warn('Push notifications are not supported');
      return null;
    }

    if (this.permissionStatus !== 'granted') {
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission denied');
        return null;
      }
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
      });

      if (options.onClick) {
        notification.onclick = () => {
          window.focus();
          options.onClick?.();
          notification.close();
        };
      }

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
      return null;
    }
  }

  async notifyMiningComplete(tokensEarned: number): Promise<void> {
    await this.showNotification({
      title: 'Mining Session Complete!',
      body: `You earned ${tokensEarned.toLocaleString()} JCMOVES tokens. Claim your rewards now!`,
      tag: 'mining-complete',
      requireInteraction: true,
      onClick: () => {
        window.location.href = '/mining';
      }
    });
  }

  async notifyNewReward(rewardType: string, amount: number): Promise<void> {
    await this.showNotification({
      title: 'New Reward Available!',
      body: `You received ${amount.toLocaleString()} JCMOVES for ${rewardType}`,
      tag: 'new-reward',
      onClick: () => {
        window.location.href = '/mining';
      }
    });
  }

  async notifyStreakBonus(streakCount: number, bonusAmount: number): Promise<void> {
    await this.showNotification({
      title: `${streakCount} Day Streak!`,
      body: `Bonus: +${bonusAmount.toLocaleString()} JCMOVES! Keep your streak going!`,
      tag: 'streak-bonus',
      onClick: () => {
        window.location.href = '/mining';
      }
    });
  }

  async notifyDailyCheckInReady(): Promise<void> {
    await this.showNotification({
      title: 'Daily Check-In Ready!',
      body: 'Your daily mining rewards are ready to claim. Don\'t break your streak!',
      tag: 'daily-checkin',
      requireInteraction: true,
      onClick: () => {
        window.location.href = '/mining';
      }
    });
  }
}

export const notificationService = new PushNotificationService();
