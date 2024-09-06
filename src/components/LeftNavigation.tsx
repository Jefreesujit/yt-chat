import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import YTLinkInput from './YTLinkInput';

type Chat = {
  id: string;
  slug: string;
  title: string;
};

const LeftNavigation = () => {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [newChat, setNewChat] = useState(false);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const response = await fetch('/api/chats');
        if (!response.ok) {
          throw new Error('Failed to fetch chats');
        }
        const data = await response.json();
        const chatData = data.body.map((chat: any) => ({
          id: chat.chat_id,
          slug: chat.chat_slug,
          title: chat.chat_name,
        }));
        setChats(chatData);
      } catch (error) {
        console.error('Error fetching chats:', error);
      }
    };

    fetchChats();
  }, []);

const handleNavigation = (chatId: string) => {
  router.push(`/chat/${chatId}`);
};


  return (
    <div className="rounded-lg">
      <div className="flex justify-between items-center p-4 rounded-t-lg">
        <h2 className="text-xl font-bold">Chats</h2>
          <button
            className="bg-gray-900 text-white rounded-full px-4 py-2 text-sm"
            onClick={() => setNewChat(true)}
          >
            New Chat
          </button>
      </div>
      <ul className="mt-8 list-none p-0 m-0">
        {chats.length === 0 ? (
          <div>
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-8 m-1 bg-gray-300 rounded"></div>
                <div className="h-8 m-1 bg-gray-300 rounded"></div>
                <div className="h-8 m-1 bg-gray-300 rounded"></div>
              </div>
            </div>
          </div>
        ) : (
          chats.map(chat => (
            <li
              key={chat.id}
              className="px-3 py-2 m-1 bg-transparent rounded cursor-pointer transition-colors duration-300 hover:bg-gray-300 whitespace-nowrap overflow-hidden text-ellipsis"
              onClick={() => handleNavigation(chat.id)}
            >
              <span className="mr-2">&#128172;</span>
              {chat.title}
            </li>
          ))
        )}
      </ul>
      {newChat && (
        <div className="flex flex-col h-full justify-between w-full mx-auto">
          <div className="flex flex-col h-full justify-between w-full mx-auto">
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50" onClick={() => setNewChat(false)}>
              <div className="p-6 bg-white shadow-lg rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <YTLinkInput />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeftNavigation;
