import 'dotenv/config';

import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { Action } from '../../../alive-constitution/contracts/action';
import type { State } from '../spine/state-model';

type TeacherActionResponse = {
  action: Action;
};

function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  return candidate.type === 'display_text' && typeof candidate.payload === 'string';
}

export async function askTeacher(signal: Signal, state: State): Promise<Action> {
  const apiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('LLM_API_KEY is required for teacher consultation');
  }

  const systemPrompt = [
    'You are the cognitive engine for a local edge AI.',
    'Use cross-domain analogical reasoning.',
    'If faced with an unknown system, apply principles from survival, strategy, or probability.',
    'Output a low-risk, reversible probe action designed to learn by doing.',
    'Do not wait for 100% certainty.',
    'Return ONLY valid JSON with this exact shape:',
    '{"action":{"type":"display_text","payload":"...","is_reversible":true}}',
    'Do not include markdown, explanations, or extra keys.',
  ].join(' ');

  const userPrompt = JSON.stringify(
    {
      signal,
      state,
      required_contract: {
        action: {
          type: 'display_text',
          payload: 'string',
          authorization_source: 'mind_decision',
        },
      },
    },
    null,
    2,
  );

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Teacher API call failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    content?: Array<{ text?: string }>;
  };

  const content =
    data.choices?.[0]?.message?.content ??
    data.content?.[0]?.text;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Teacher response content missing');
  }

  const parsed = JSON.parse(content) as TeacherActionResponse;

  if (!parsed || !isAction(parsed.action)) {
    throw new Error('Teacher response does not match Action contract');
  }

  return {
    ...parsed.action,
    authorization_source: 'mind_decision',
  } as Action;
}
