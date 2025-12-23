import { streamText, convertToCoreMessages } from 'ai';
import { getContext } from '@/lib/vectordb';
import { SYSTEM_PROMPT } from '@/lib/constants';
import { updateChat } from '@/lib/datastore';
import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from "next/server";
import { createTogetherAI } from '@ai-sdk/togetherai';

const togetherai = createTogetherAI({
  apiKey: process.env.TOGETHER_AI_API_KEY ?? '',
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({
      body: 'Unauthorized',
    }, {
      status: 401,
    });
  }
  console.log('POST request received');
  const { messages, chatId } = await req.json();
  const lastMessage = messages[messages.length - 1];
  const context = await getContext(lastMessage.content, chatId);
  let systemPrompt = SYSTEM_PROMPT.replace('{{videoContext}}', context);
  const result = await streamText({
    // @ts-ignore
    model: togetherai('ServiceNow-AI/Apriel-1.6-15b-Thinker'),
    system: systemPrompt,
    maxTokens: 8000,
    messages: convertToCoreMessages(messages),
    onFinish: async(result) => {
      const updatedMessages = [
        ...messages,
        {
          role: 'assistant',
          content: result.text,
        },
      ];
      console.log('updatedMessages', updatedMessages);
      const response = await updateChat(chatId, user.id, updatedMessages);
      console.log('response', response);
    },
  });

  return result.toDataStreamResponse();
}
