import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
  private active = 0;

  enqueue(item: Omit<QueueItem, 'resolve' | 'reject'>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...item, resolve, reject });
      this.processNext();
    });
  }

  private async processNext() {
    if (this.active >= MAX_CONCURRENT || this.queue.length === 0) return;

    this.active++;
    const item = this.queue.shift()!;

    try {
      const result = await invoke('download_media', {
        accountId: item.accountId,
        chatId: item.chatId,
        messageId: item.messageId,
      });
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.active--;
      this.processNext();
    }
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
