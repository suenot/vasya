import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useDownloadStore, DownloadItemInfo } from '../store/downloadStore';

interface QueueItem {
  accountId: string;
  chatId: number;
  messageId: number;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

const MAX_CONCURRENT = 3;

class MediaDownloadQueue {
  private queue: QueueItem[] = [];
  private activeItems: QueueItem[] = [];
  private completed = 0;
  private failed = 0;
  private seenKeys = new Set<string>();

  /** Move all queued items for chatId to front of queue */
  prioritize(chatId: number) {
    const prioritized = this.queue.filter(item => item.chatId === chatId);
    const rest = this.queue.filter(item => item.chatId !== chatId);
    this.queue = [...prioritized, ...rest];
    this.syncStore();
  }

  /** Remove queued (not active) items that are NOT for the given chatId */
  trimNonPriority(activeChatId: number, keepMax = 10) {
    const forChat = this.queue.filter(item => item.chatId === activeChatId);
    const other = this.queue.filter(item => item.chatId !== activeChatId);
    const trimmed = other.slice(0, keepMax);
    for (const item of other.slice(keepMax)) {
      this.seenKeys.delete(`${item.chatId}_${item.messageId}`);
      item.reject('cancelled');
    }
    this.queue = [...forChat, ...trimmed];
    this.syncStore();
  }

  enqueue(item: Omit<QueueItem, 'resolve' | 'reject'>): Promise<any> {
    const key = `${item.chatId}_${item.messageId}`;
    if (this.seenKeys.has(key)) {
      return Promise.resolve(null);
    }
    this.seenKeys.add(key);

    return new Promise((resolve, reject) => {
      this.queue.push({ ...item, resolve, reject });
      this.syncStore();
      this.processNext();
    });
  }

  getStats() {
    return {
      queued: this.queue.length,
      active: this.activeItems.length,
      completed: this.completed,
      failed: this.failed,
    };
  }

  private async processNext() {
    if (this.activeItems.length >= MAX_CONCURRENT || this.queue.length === 0) return;

    const item = this.queue.shift()!;
    this.activeItems.push(item);
    this.syncStore();

    try {
      const result = await invoke('download_media', {
        accountId: item.accountId,
        chatId: item.chatId,
        messageId: item.messageId,
      });
      this.completed++;
      item.resolve(result);
    } catch (error) {
      this.failed++;
      item.reject(error);
    } finally {
      this.activeItems = this.activeItems.filter(i => i !== item);
      this.syncStore();
      this.processNext();
    }
  }

  private syncStore() {
    const toInfo = (item: QueueItem, status: DownloadItemInfo['status']): DownloadItemInfo => ({
      chatId: item.chatId,
      messageId: item.messageId,
      status,
    });

    useDownloadStore.getState().update({
      queued: this.queue.length,
      active: this.activeItems.length,
      completed: this.completed,
      failed: this.failed,
      activeItems: this.activeItems.map(i => toInfo(i, 'active')),
      queuedItems: this.queue.slice(0, 20).map(i => toInfo(i, 'queued')),
    });
  }
}

// Singleton queue
const globalQueue = new MediaDownloadQueue();

export function useMediaQueue() {
  return useCallback(
    (accountId: string, chatId: number, messageId: number) =>
      globalQueue.enqueue({ accountId, chatId, messageId }),
    []
  );
}

/** Call when user switches to a new chat -- prioritizes that chat's downloads */
export function prioritizeChat(chatId: number) {
  globalQueue.prioritize(chatId);
  globalQueue.trimNonPriority(chatId);
}

export function getQueueStats() {
  return globalQueue.getStats();
}
