import { useMemo } from 'react';
import { MessageBase } from '../store/messagesStore';

/** Time window (seconds) within which consecutive messages may be auto-merged. */
const MERGE_TIME_THRESHOLD = 3;

/**
 * A group of consecutive messages that should be displayed as a single bubble.
 * When `messages` has length 1, there is no merge — render normally.
 */
export interface MergedMessageGroup {
  /** The "display" message: first message in the group (carries sender info, timestamp). */
  display: MessageBase;
  /** All original messages in the group (in chronological order). */
  messages: MessageBase[];
  /** Concatenated text of all messages in the group (joined by newline). */
  mergedText: string;
}

/**
 * Returns true when `text` looks like a sentence that was cut mid-way
 * (no terminal punctuation) or the next message starts with lowercase,
 * suggesting the two were originally one message split by Telegram.
 */
function looksLikeSplit(currentText: string, nextText: string): boolean {
  const trimmedCurrent = currentText.trimEnd();
  const trimmedNext = nextText.trimStart();

  if (!trimmedCurrent || !trimmedNext) return false;

  const lastChar = trimmedCurrent[trimmedCurrent.length - 1];

  // Current message does NOT end with sentence-ending punctuation
  const endsWithTerminal = /[.!?\u2026\u0021\u003F]$/.test(lastChar);

  // Next message starts with a lowercase letter (any script)
  const startsLower = trimmedNext[0] === trimmedNext[0].toLowerCase() &&
    trimmedNext[0] !== trimmedNext[0].toUpperCase();

  // Either heuristic is enough: no terminal punctuation OR next starts lowercase
  return !endsWithTerminal || startsLower;
}

/**
 * Determines whether two adjacent messages should be merged.
 */
function shouldMerge(prev: MessageBase, curr: MessageBase): boolean {
  // Must be from the same sender
  if (prev.from_user_id !== curr.from_user_id) return false;
  if (prev.is_outgoing !== curr.is_outgoing) return false;

  // Must both be text-only (no media)
  if (prev.media && prev.media.length > 0) return false;
  if (curr.media && curr.media.length > 0) return false;

  // Must both have text
  if (!prev.text || !curr.text) return false;

  // Must be within the time window
  if (Math.abs(curr.date - prev.date) > MERGE_TIME_THRESHOLD) return false;

  // Text heuristic: looks like a split message
  if (!looksLikeSplit(prev.text, curr.text)) return false;

  return true;
}

/**
 * Takes a flat array of messages and returns merged groups.
 * When merging is disabled, each message becomes its own single-element group.
 */
export function mergeMessages(messages: MessageBase[], enabled: boolean): MergedMessageGroup[] {
  if (!enabled || messages.length === 0) {
    return messages.map((m) => ({
      display: m,
      messages: [m],
      mergedText: m.text || '',
    }));
  }

  const groups: MergedMessageGroup[] = [];
  let currentGroup: MessageBase[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];

    if (shouldMerge(prev, curr)) {
      currentGroup.push(curr);
    } else {
      // Flush current group
      groups.push(buildGroup(currentGroup));
      currentGroup = [curr];
    }
  }

  // Flush last group
  if (currentGroup.length > 0) {
    groups.push(buildGroup(currentGroup));
  }

  return groups;
}

function buildGroup(msgs: MessageBase[]): MergedMessageGroup {
  const mergedText = msgs.map((m) => m.text || '').join('\n');
  return {
    display: msgs[0],
    messages: msgs,
    mergedText,
  };
}

/**
 * React hook that memoises merged message groups.
 */
export function useMergedMessages(messages: MessageBase[], enabled: boolean): MergedMessageGroup[] {
  return useMemo(() => mergeMessages(messages, enabled), [messages, enabled]);
}
