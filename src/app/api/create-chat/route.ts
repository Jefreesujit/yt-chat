/* -----------------Globals--------------- */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from '@clerk/nextjs/server';

/* -----------------Helpers & Hooks--------------- */
import { getVideoId } from "@/lib/utils";
import { loadTranscriptIntoVectorDB } from "@/lib/vectordb";
import { createChat } from "@/lib/datastore";

/* -----------------Third-party Libraries--------------- */
import { YouTubeTranscriptApi } from 'yt-transcript-ts';

const fetchVideoMetadata = async (videoId: string) => {
  try {
    // Fetch video page to extract metadata
    const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(videoPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video page: ${response.status}`);
    }

    const html = await response.text();

    // Extract title from page
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) ||
                      html.match(/<title>([^<]+)<\/title>/);

    const title = titleMatch ? titleMatch[1].replace(/ - YouTube$/, '').trim() : null;

    if (!title) {
      throw new Error('Could not extract video title');
    }

    return { title };
  } catch (error: any) {
    console.error('Error fetching video metadata:', error);
    throw new Error(`Failed to fetch video metadata: ${error.message}`);
  }
};

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

    const videoId = getVideoId(videoUrl);
    if (!videoId) {
      return NextResponse.json({
        body: 'Invalid YouTube video URL',
        error: 'VALIDATION_ERROR',
      }, {
        status: 400,
      });
    }

    let transcript;
    let metadata;
    try {
      console.log('Fetching transcript for video:', videoUrl);

      const transcriptApi = new YouTubeTranscriptApi();
      // fetchTranscript accepts: videoId, languages (optional), format (optional)
      const response = await transcriptApi.fetchTranscript(videoId, ['en']);

      // Get metadata from transcript response (includes title and author)
      if ((response as any).metadata?.title) {
        metadata = (response as any).metadata;
        console.log('Metadata fetched from transcript API:', { title: metadata.title });
      } else {
        // Fallback to manual fetch if transcript API doesn't provide metadata
        console.log('No metadata in transcript response, fetching manually...');
        metadata = await fetchVideoMetadata(videoId);
        console.log('Metadata fetched manually:', { title: metadata?.title });
      }

      // Convert to expected format - check actual response structure
      // Response should have transcript.snippets array
      const snippets = (response as any).transcript?.snippets || (response as any).snippets || [];

      // Ensure we have metadata
      if (!metadata || !metadata.title) {
        throw new Error('Failed to get video title');
      }

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

    // Create video details from metadata
    const videoDeatails = {
      name: metadata.title,
      slug: videoId,
      url: videoUrl,
    };

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
