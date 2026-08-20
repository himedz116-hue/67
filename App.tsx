import React, { useState, useEffect, useRef } from 'react';
import Pusher from 'pusher-js';

export default function App() {
  const [streamerName, setStreamerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamerInfo, setStreamerInfo] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  
  const pusherRef = useRef<Pusher | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const searchStreamer = async () => {
    const name = streamerName.trim().toLowerCase();
    if (!name) return;

    setLoading(true);
    setError('');
    setStreamerInfo(null);
    setChatMessages([]);

    if (pusherRef.current) {
      pusherRef.current.disconnect();
      pusherRef.current = null;
    }

    try {
      const apiUrl = `https://kick.com/api/v2/channels/${name}`;
      
      const proxies = [
        `/api/kick?endpoint=${encodeURIComponent(apiUrl)}`, // Vercel API
        `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(apiUrl)}`
      ];

      // إرسال الطلبات في نفس الوقت وأخذ أول استجابة صحيحة (لأقصى سرعة)
      const fetchProxy = async (proxy: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        
        try {
          const response = await fetch(proxy, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error('Bad response');

          const rawData = await response.json();
          let parsedData = rawData;

          if (proxy.includes('allorigins')) {
             if (!rawData.contents) throw new Error('No contents');
             parsedData = JSON.parse(rawData.contents);
          }

          // التأكد من أن البيانات هي فعلاً بيانات القناة وليست رسالة خطأ
          if (parsedData && (parsedData.user || (parsedData.message && parsedData.message.includes('not found')))) {
            return parsedData;
          }
          throw new Error('Invalid data format');
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      };

      let data: any = null;
      
      try {
        data = await Promise.any(proxies.map(p => fetchProxy(p)));
      } catch (e) {
        throw new Error('فشل في الاتصال بخوادم Kick (نظام حماية Cloudflare). جرب مرة أخرى أو تأكد من Vercel.');
      }

      if (data.message && data.message.includes('not found')) {
        throw new Error('القناة غير موجودة أو الاسم غير صحيح.');
      }

      setStreamerInfo(data);

      if (data.livestream && data.chatroom?.id) {
        connectChat(data.chatroom.id);
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء البحث');
    } finally {
      setLoading(false);
    }
  };

  const connectChat = (chatroomId: number) => {
    const pusher = new Pusher('32cbd69e4b950bf97679', {
      cluster: 'us2',
      forceTLS: true,
      enabledTransports: ['ws', 'wss']
    });

    const channel = pusher.subscribe(`chatrooms.${chatroomId}.v2`);

    channel.bind('App\\Events\\ChatMessageEvent', (data: any) => {
      setChatMessages(prev => {
        const newMsgs = [...prev, data];
        return newMsgs.length > 100 ? newMsgs.slice(newMsgs.length - 100) : newMsgs;
      });
    });

    channel.bind('App\\Events\\MessageDeletedEvent', (data: any) => {
      const msgId = data.message?.id;
      if (msgId) {
        setChatMessages(prev => prev.filter(msg => msg.id !== msgId));
      }
    });

    pusherRef.current = pusher;
  };

  useEffect(() => {
    return () => {
      if (pusherRef.current) {
        pusherRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1115] text-white font-sans p-5" dir="rtl">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#53fc18] mb-2">مستعرض قنوات Kick 🟢</h1>
          <p className="text-gray-400">أدخل اسم الاستريمر لعرض معلوماته، البث المباشر، والشات</p>
        </div>

        <div className="flex justify-center gap-3 mb-8">
          <input
            type="text"
            className="px-4 py-3 w-[300px] rounded-lg border border-[#53fc18] bg-[#1c1f24] text-white focus:outline-none"
            placeholder="اسم القناة (مثال: xqc)"
            value={streamerName}
            onChange={(e) => setStreamerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchStreamer()}
          />
          <button
            onClick={searchStreamer}
            disabled={loading}
            className="px-6 py-3 bg-[#53fc18] text-black font-bold rounded-lg hover:bg-[#45e012] transition-colors disabled:opacity-50"
          >
            بحث
          </button>
        </div>

        {loading && <div className="text-center text-[#53fc18] text-xl">جاري البحث... ⏳</div>}
        
        {error && (
          <div className="text-center text-[#ff2a2a] bg-[#ff2a2a]/10 p-4 rounded-lg mb-8">
            ❌ خطأ: {error}
          </div>
        )}

        {streamerInfo && (
          <div className="bg-[#1c1f24] border border-gray-800 p-6 rounded-xl flex flex-wrap items-center gap-6 mb-8 shadow-lg">
            <img 
              src={streamerInfo.user?.profile_pic || 'https://kick.com/favicon.ico'} 
              alt="Avatar" 
              className="w-24 h-24 rounded-full border-2 border-[#53fc18]"
            />
            <div className="flex-1 min-w-[200px]">
              <h2 className="text-2xl font-bold mb-2">{streamerInfo.user?.username}</h2>
              <div className="flex items-center gap-4 mb-2 text-sm">
                {streamerInfo.livestream ? (
                  <span className="bg-[#ff2a2a] text-white px-3 py-1 rounded-md font-bold">🔴 يبث الآن</span>
                ) : (
                  <span className="bg-gray-600 text-white px-3 py-1 rounded-md font-bold">⚫ غير متصل (Offline)</span>
                )}
                <span className="text-gray-300">👥 المتابعون: <strong className="text-white">{(streamerInfo.followersCount || streamerInfo.followers_count || 0).toLocaleString()}</strong></span>
              </div>
              <p className="text-gray-400 text-sm line-clamp-2">{streamerInfo.user?.bio || 'لا يوجد وصف (بايو)'}</p>
              
              {streamerInfo.livestream && (
                <div className="mt-3 text-[#53fc18] font-bold text-sm">
                  العنوان: {streamerInfo.livestream.session_title}
                </div>
              )}
            </div>
          </div>
        )}

        {streamerInfo?.livestream && (
          <div className="flex flex-col lg:flex-row gap-5 h-[600px]">
            <div className="flex-[3] bg-black rounded-xl overflow-hidden border border-gray-800">
              <iframe
                src={`https://player.kick.com/${streamerInfo.user?.username}?autoplay=true`}
                className="w-full h-full"
                allowFullScreen
              ></iframe>
            </div>
            
            <div className="flex-[1] bg-[#1c1f24] rounded-xl flex flex-col border border-gray-800 overflow-hidden">
              <div className="bg-[#25282e] p-4 text-center font-bold border-b border-gray-800">
                الشات المباشر 💬
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="text-sm break-words">
                    <span 
                      className="font-bold" 
                      style={{ color: msg.sender?.identity?.color || '#53fc18' }}
                    >
                      {msg.sender?.username}
                    </span>
                    <span className="text-gray-300">: </span>
                    <span className="text-white">{msg.content}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}