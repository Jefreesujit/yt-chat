/* -----------------Globals--------------- */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from '@clerk/nextjs/server';

/* -----------------Helpers & Hooks--------------- */
import { getVideoId } from "@/lib/utils";
import { loadTranscriptIntoVectorDB } from "@/lib/vectordb";
import { createChat } from "@/lib/datastore";

/* -----------------Third-party Libraries--------------- */
import { YouTubeTranscriptApi } from 'yt-transcript-ts';
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
    console.log('Creating chat for user:', userId);

    // Use Next.js built-in JSON parsing instead of custom buffer
    const { videoUrl } = await request.json();
    console.log('Video URL:', videoUrl);

    if (!videoUrl) {
      return NextResponse.json({
        body: 'Video URL is required',
        error: 'VALIDATION_ERROR',
      }, {
        status: 400,
      });
    }

    let metadata;
    try {
      console.log('Fetching video metadata...');
      metadata = await YoutubeMetadata(videoUrl);
      console.log('Metadata fetched:', { title: metadata?.title });
    } catch (metadataError: any) {
      console.error('Error fetching metadata:', metadataError);
      return NextResponse.json({
        body: 'Failed to fetch video metadata. Please check if the video URL is valid.',
        error: 'METADATA_ERROR',
        details: metadataError?.message,
      }, {
        status: 400,
      });
    }

    if (!metadata || !metadata.title) {
      return NextResponse.json({
        body: 'Failed to fetch video metadata. The video may not be available.',
        error: 'METADATA_ERROR',
      }, {
        status: 400,
      });
    }

    const videoDeatails = {
      name: metadata.title,
      slug: getVideoId(videoUrl),
      url: videoUrl,
    };

    let transcript;
    try {
      console.log('Fetching transcript for video:', videoUrl);
      const videoId = getVideoId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube video URL');
      }

      const api = new YouTubeTranscriptApi();
      // fetchTranscript accepts: videoId, languages (optional), format (optional)
      const response = await api.fetchTranscript(videoId, ['en']);

      // Convert to expected format - check actual response structure
      // Response should have transcript.snippets array
      const snippets = (response as any).transcript?.snippets || (response as any).snippets || [];

      if (Array.isArray(snippets) && snippets.length > 0) {
        transcript = snippets.map((snippet: any, index: number, array: any[]) => {
          // Calculate duration from next snippet's start, or use default if last snippet
          const nextStart = index < array.length - 1 ? array[index + 1].start : snippet.start + 5; // Default 5 seconds for last snippet
          const duration = nextStart - snippet.start;

          return {
            text: snippet.text,
            offset: (snippet.start || 0) * 1000, // Convert seconds to milliseconds
            duration: duration * 1000, // Convert seconds to milliseconds
          };
        });
      } else {
        // Try to get formatted text if available
        const formattedText = (response as any).formattedText || (response as any).text;
        if (formattedText) {
          transcript = [{ text: formattedText, offset: 0, duration: 0 }];
        } else {
          throw new Error('Unexpected transcript format from package');
        }
      }

      console.log(`Fetched ${transcript.length} transcript entries`);
    } catch (transcriptError: any) {
      console.error('Transcript fetch error:', transcriptError);
      return NextResponse.json({
        body: 'Failed to fetch transcript. The video may not be available or may not have captions available.',
        error: 'TRANSCRIPT_ERROR',
        details: transcriptError?.message || 'Unknown error',
      }, {
        status: 400,
      });
    }

    if (!transcript || transcript.length === 0) {
      console.error('Transcript is empty or null');
      return NextResponse.json({
        body: 'Failed to fetch transcript. The video may not have captions available.',
        error: 'TRANSCRIPT_ERROR',
        details: 'Transcript returned empty array',
      }, {
        status: 400,
      });
    }

    console.log('Creating chat in database...');
    const chat = await createChat(userId, videoDeatails);
    if (!chat) {
      console.error('Failed to create chat in database');
      return NextResponse.json({
        body: 'Error creating chat',
        error: 'DATABASE_ERROR',
      }, {
        status: 500,
      });
    }

    console.log('Loading transcript into vector DB...');
    await loadTranscriptIntoVectorDB(videoUrl, transcript, chat.chat_id);
    console.log('Chat created successfully:', chat.chat_id);

    return NextResponse.json({
      chatId: chat.chat_id,
    });
  } catch (error: any) {
    console.error('Error processing POST request:', error);
    console.error('Error stack:', error?.stack);
    return NextResponse.json({
      body: 'Internal Server Error',
      error: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development'
        ? error?.message
        : undefined,
    }, {
      status: 500,
    });
  }
}
