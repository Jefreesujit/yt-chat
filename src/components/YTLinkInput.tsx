'use client';

import { useState, ChangeEvent, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, RedirectToSignIn } from '@clerk/nextjs';
import Image from 'next/image';

const YTLinkInput = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [searchString, setSearchString] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState<number>(0);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [showSignInDialog, setShowSignInDialog] = useState(false);

  const { isSignedIn } = useUser();
  const loadingMessages = useMemo(() => [
    'Fetching youtube video info...',
    'Analyzing video content...',
    'Processing transcripts...',
    'Creating chat...',
    'Chat created successfully!',
  ], []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        setCurrentMessageIndex((prevIndex) => {
          if (prevIndex < loadingMessages.length - 1) {
            return prevIndex + 1;
          } else {
            clearInterval(interval);
            return prevIndex;
          }
        });
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [loading, loadingMessages]);

  const isValidYoutubeUrl = (url: string) => {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
  };

  let debounceTimeout: NodeJS.Timeout;

  const handleDebouncedSearch = (query: string) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      const results = await fetch(`/api/search?query=${query}`);
      const data = await results.json();
      console.log(data);
      setSearchResults(data.items);
    }, 500);
  };

  const handleSubmit = async (result: any) => {
    setLoading(true);
    setErrMsg('');
    try {
      const response = await fetch('/api/create-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoUrl: `https://www.youtube.com/watch?v=${result.id}` }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const errorMessage = responseData.body || responseData.error || 'Failed to create chat';
        console.error('API Error:', {
          status: response.status,
          error: responseData.error,
          body: responseData.body,
          details: responseData.details,
        });
        setErrMsg(errorMessage);
        return;
      }

      const { chatId } = responseData;
      if (!chatId) {
        throw new Error('No chat ID returned from server');
      }

      router.push(`/chat/${chatId}`);
      setErrMsg('');
    } catch (error: any) {
      console.error('Error:', error);
      setErrMsg(error?.message || 'Failed to create chat. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setSearchString(e.target.value);
    handleDebouncedSearch(e.target.value);
    if (errMsg) {
      setErrMsg('');
    }
  };

  const handleItemClick = async (result: any) => {
    if (!isSignedIn) {
      setShowSignInDialog(true);
      return;
    } else {
      setSearchResults([]);
      setSearchString(result.title);
      setInputDisabled(true);
      handleSubmit(result);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex items-center space-x-4">
        <input
          type="url"
          placeholder="Search for a YouTube video"
          value={searchString}
          onChange={handleInputChange}
          className="p-3 border border-gray-300 rounded max-w-lg w-full"
          required
          disabled={inputDisabled}
        />
      </form>
      {loading && (
        <div className="mt-4 flex justify-center items-center space-x-2">
          <div className="spinner-border border-gray-200 animate-spin inline-block w-4 h-4 border-2 rounded-full" role="status"></div>
          <span className="text-gray-600 font-semibold">{loadingMessages[currentMessageIndex]}</span>
        </div>
      )}
      {errMsg && !loading && (
        <div className="mt-4 flex justify-center items-center space-x-2">
          <div className="text-gray-600 font-semibold">{errMsg}</div>
        </div>
      )}
      {showSignInDialog && (
        <RedirectToSignIn />
      )}
      {searchResults.length > 0 && (
        <ul className="absolute mt-1 border border-gray-300 rounded-2xl max-w-lg bg-white z-10 max-h-80 overflow-y-auto shadow-lg w-full transform translate-x-[-15px] translate-y-[12px]">
          {searchResults.map((result: any) => (
            <li
              key={result.id}
              onClick={() => handleItemClick(result)}
              className="ml-2 mt-2 mb-2 px-4 py-2 cursor-pointer hover:bg-gray-100 flex items-center space-x-4 rounded-2xl transition duration-200 ease-in-out transform hover:scale-105"
            >
              <Image
                src={`https://img.youtube.com/vi/${result.id}/default.jpg`}
                width={64}
                height={64}
                alt={result.title}
                className="w-16 h-9 rounded-md"
              />
              <span className="text-gray-800 font-semibold">{result.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default YTLinkInput;
