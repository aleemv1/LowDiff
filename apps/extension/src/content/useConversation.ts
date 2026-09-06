import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ChatTurn, PrLocation } from '../shared/messages.js';
import { Conversation } from './conversation.js';

const EMPTY: ChatTurn[] = [];

export function useConversation(pr: PrLocation, seed: ChatTurn[] = EMPTY) {
  const conversation = useMemo(() => new Conversation(pr, seed), [pr.owner, pr.repo, pr.number, seed]);
  const [, render] = useState(0);
  useEffect(() => {
    const unsubscribe = conversation.subscribe(() => render(n => n + 1));
    return () => { unsubscribe(); conversation.dispose(); };
  }, [conversation]);
  return { conversation, ...conversation.snapshot };
}
