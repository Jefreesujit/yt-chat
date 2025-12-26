/* -----------------Globals--------------- */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from '@clerk/nextjs/server';

/* -----------------Helpers & Hooks--------------- */
import { buffer, getVideoId } from "@/lib/utils";
import { loadTranscriptIntoVectorDB } from "@/lib/vectordb";
import { createChat } from "@/lib/datastore";

/* -----------------Third-party Libraries--------------- */
import { fetchTranscript } from 'youtube-transcript-plus';
// tslint:disable-next-line
import YoutubeMetadata from 'youtube-meta-data';

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({
        body: 'Unauthorized',
      }, {
        status: 401,
      });
    }
    const userId = user.id;
    const reqBuffer = await buffer(request.body);
    const reqBody = await reqBuffer.toString();
    const { videoUrl } = JSON.parse(reqBody);
    const metadata = await YoutubeMetadata(videoUrl);

    const videoDeatails = {
      name: metadata.title,
      slug: getVideoId(videoUrl),
      url: videoUrl,
    };

    let transcript;
    try {
      transcript = await fetchTranscript(videoUrl);
    } catch (transcriptError: any) {
      return NextResponse.json({
        body: 'Failed to fetch transcript. The video may not be available or may not have captions available.',
        error: 'TRANSCRIPT_ERROR',
      }, {
        status: 400,
      });
    }

    if (!transcript || transcript.length === 0) {
      return NextResponse.json({
        body: 'Failed to fetch transcript. The video may not have captions available.',
        error: 'TRANSCRIPT_ERROR',
      }, {
        status: 400,
      });
    }

    const chat = await createChat(userId, videoDeatails);
    if (!chat) {
      return NextResponse.json({
        body: 'Error creating chat',
      }, {
        status: 500,
      });
    }

    await loadTranscriptIntoVectorDB(videoUrl, transcript, chat.chat_id);
    return NextResponse.json({
      chatId: chat.chat_id,
    });
  } catch (error) {
    console.error('Error processing POST request:', error);
    return NextResponse.json({
      body: 'Internal Server Error',
    }, {
      status: 500,
    });
  }
}
