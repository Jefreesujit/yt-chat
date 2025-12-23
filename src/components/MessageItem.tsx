import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@ai-sdk/ui-utils';
import { User, Bot } from 'lucide-react';

interface MessageItemProps {
  message: Message;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  return (
    <div className={`flex items-start ${message.role === 'user'
      ? 'self-end text-right'
      : 'self-start text-left'
      } relative`} key={message.id} >
      {message.role === 'user' ? (
        <>
          <div
            className={`flex items-start whitespace-pre-wrap p-4 rounded-2xl mb-4 max-w-2xl bg-gray-100 self-end text-right`}
            style={{ alignSelf: 'flex-end' }}
          >
            <div>{message.content}</div>
          </div>
          <div className="absolute top-0 right-[-60px] mt-2 mr-2 p-2 rounded-full bg-white border border-gray-300">
            <User />
          </div>
        </>
      ) : (
        <>
          <div className="absolute top-0 left-[-60px] mt-2 ml-2 p-2 rounded-full bg-white border border-gray-300">
            <Bot />
          </div>
          <div
            className={`flex items-start whitespace-pre-wrap p-4 rounded-2xl mb-4 max-w-2xl bg-gradient-to-r from-rose-100 to-teal-100 self-start text-left`}
            style={{ alignSelf: 'flex-start' }}
          >
            <div>
              {message.content ? (
                <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
              ) : (
                <span className="text-gray-500 italic">
                  I apologize, but I couldn&apos;t generate a response. Please try again.
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MessageItem;
